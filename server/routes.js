const express = require('express');
const router = express.Router();
const { fetchAndProcessFeed } = require('./services/rss');
const { summarizeArticle } = require('./services/ai');
const { fetchVideos, parseLimit, parseTopics } = require('./services/videos');
const { validateOutboundHttpUrl } = require('./services/urlSafety');
const { getCanonicalFeedUrl, getUnsupportedFeedReason } = require('./services/feedUrlCatalog');
const { requireAdmin, limitAdminMutation, limitSummarization } = require('./services/adminAuth');
const {
    getFeedUpdateStatus,
    requestFeedRefresh,
    repairAllArticlesEncoding,
    repairArticleFieldsInPlace
} = require('./services/rss');
const { repairMojibake, repairMojibakeDeep } = require('./services/encoding');
const prisma = require('./db');

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;
const MAX_SOURCE_NAME_LENGTH = 120;
const MAX_SOURCE_CATEGORY_LENGTH = 64;
const RANKING_MINUTE_MS = 60 * 1000;

// Categories kept out of the general article feed (Dashboard, Daily Brief,
// category chips, search). They live in their own dedicated page; the Breaches
// page passes this label explicitly through the `category` query parameter to
// reach them, which is the only path that should ever return them.
const BREACH_CATEGORY_LABEL = 'Fuites de données';
const BREACH_CATEGORY_VALUES = new Set([BREACH_CATEGORY_LABEL]);

function isBreachCategory(value) {
    return typeof value === 'string' && BREACH_CATEGORY_VALUES.has(value);
}

/**
 * Prisma "where" fragment that hides breach articles from a feed-style query.
 * Articles that have either a direct category OR a source category matching the
 * breach label are excluded. Returns null when the caller has asked for breach
 * articles explicitly (via the category parameter), so the helper becomes a
 * no-op in that case.
 */
function buildBreachExclusionWhere({ allowBreaches = false } = {}) {
    if (allowBreaches) {
        return null;
    }
    return {
        AND: [
            { category: { notIn: [...BREACH_CATEGORY_VALUES] } },
            { source: { category: { notIn: [...BREACH_CATEGORY_VALUES] } } }
        ]
    };
}
const CATEGORY_RANK_BOOST_MINUTES = {
    'Cybersecurité': 90,
    'Intelligence Artificielle': 75,
    'Cloud': 45,
    'Développement': 45,
    'Business': 20,
    'Hardware': 20,
    'Web': 15,
    'Société': 10,
    'Autre': -20
};

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEntityId(value) {
    return parsePositiveInt(value, null);
}

function normalizeInput(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, maxLength);
}

function resolveArticleCategory(article) {
    return article?.category || article?.source?.category || 'Autre';
}

function getArticleRankScore(article) {
    const dateMs = new Date(article?.date || 0).getTime();
    let score = Number.isFinite(dateMs) ? dateMs : 0;
    const category = resolveArticleCategory(article);

    score += (CATEGORY_RANK_BOOST_MINUTES[category] || 0) * RANKING_MINUTE_MS;

    if (article?.isBookmarked) {
        score += 6 * 60 * RANKING_MINUTE_MS;
    }
    if (article?.image) {
        score += 20 * RANKING_MINUTE_MS;
    }
    if (article?.summary) {
        score += 10 * RANKING_MINUTE_MS;
    }
    if (!article?.content || article.content.trim().length < 120) {
        score -= 20 * RANKING_MINUTE_MS;
    }

    return score;
}

function rankArticlesForDailyScan(articles) {
    return [...articles].sort((a, b) => {
        const scoreDelta = getArticleRankScore(b) - getArticleRankScore(a);
        if (scoreDelta !== 0) {
            return scoreDelta;
        }
        return (b.id || 0) - (a.id || 0);
    });
}

async function validateSourcePayload(payload) {
    const name = normalizeInput(payload?.name, MAX_SOURCE_NAME_LENGTH);
    const category = normalizeInput(payload?.category, MAX_SOURCE_CATEGORY_LENGTH) || 'Autre';
    const rawUrl = normalizeInput(payload?.url, 2048);
    const normalizedRawUrl = getCanonicalFeedUrl(rawUrl) || rawUrl;

    if (!name) {
        return { ok: false, error: 'Source name is required.' };
    }

    if (!rawUrl) {
        return { ok: false, error: 'Source URL is required.' };
    }

    const unsupportedReason = getUnsupportedFeedReason(normalizedRawUrl);
    if (unsupportedReason) {
        return { ok: false, error: `Source URL unsupported: ${unsupportedReason}` };
    }

    const urlValidation = await validateOutboundHttpUrl(normalizedRawUrl, {
        allowPrivateNetwork: false,
        resolveDns: true
    });

    if (!urlValidation.ok) {
        return { ok: false, error: `Source URL rejected: ${urlValidation.reason}` };
    }

    return {
        ok: true,
        data: {
            name,
            category,
            url: urlValidation.normalizedUrl
        }
    };
}

// Health check
router.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'connected', rss: getFeedUpdateStatus() });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({ status: 'error', database: 'disconnected', rss: getFeedUpdateStatus() });
    }
});

// GET /articles - List articles with pagination and search
router.get('/articles', async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const sourceId = parsePositiveInt(req.query.sourceId, null);
    const maxAllowedDate = new Date(Date.now() + MAX_FUTURE_SKEW_MS);

    const where = {};
    const conditions = [
        { date: { lte: maxAllowedDate } },
        { OR: [{ category: null }, { category: { not: 'Spam' } }] }
    ];

    // Filtre de recherche textuelle
    if (search) {
        conditions.push({
            OR: [
                { title: { contains: search } },
                { content: { contains: search } }
            ]
        });
    }

    // Filtre de catégorie
    if (category && typeof category === 'string' && category.trim() !== '') {
        conditions.push({
            OR: [
                { category: category },
                { source: { category: category } }
            ]
        });
    }

    // Filtre de favoris
    if (req.query.bookmarked === 'true') {
        conditions.push({ isBookmarked: true });
    }

    // Filtre de source
    if (sourceId !== null) {
        conditions.push({ sourceId });
    }

    // Les articles "Fuites de données" ne vivent que dans la page dédiée.
    // On ne les inclut ici que si la catégorie demandée est explicitement
    // celle des fuites de données (cas de la page Breaches).
    const allowBreaches = isBreachCategory(category);
    const breachExclusion = buildBreachExclusionWhere({ allowBreaches });
    if (breachExclusion) {
        conditions.push(breachExclusion);
    }

    // Combiner toutes les conditions avec AND
    if (conditions.length > 0) {
        where.AND = conditions;
    }

    try {
        const articles = await prisma.article.findMany({
            where,
            orderBy: [
                { date: 'desc' },
                { id: 'desc' }
            ],
            take: limit,
            skip: (page - 1) * limit,
            include: { source: true }
        });

        const total = await prisma.article.count({ where });

        res.json({
            data: repairMojibakeDeep(rankArticlesForDailyScan(articles)),
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ error: error.message });
    }
});

// Source administration is intentionally protected as it exposes feed URLs and changes global data.
router.use('/sources', requireAdmin);

// GET /sources - List sources
router.get('/sources', async (req, res) => {
    try {
        const sources = await prisma.source.findMany({
            orderBy: [
                { isActive: 'desc' },
                { name: 'asc' }
            ]
        });
        res.json(sources);
    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /sources/health - Source health overview
router.get('/sources/health', async (req, res) => {
    try {
        const now = new Date();
        const sources = await prisma.source.findMany({
            select: {
                id: true,
                name: true,
                url: true,
                category: true,
                isActive: true,
                consecutiveFailures: true,
                lastFailureAt: true,
                lastError: true,
                cooldownUntil: true,
                lastFetched: true
            },
            orderBy: [
                { isActive: 'desc' },
                { consecutiveFailures: 'desc' },
                { name: 'asc' }
            ]
        });

        const data = sources.map((source) => {
            const cooldownUntil = source.cooldownUntil ? new Date(source.cooldownUntil) : null;
            const isCoolingDown = Boolean(cooldownUntil && cooldownUntil > now);
            return {
                ...source,
                isCoolingDown
            };
        });

        const summary = {
            total: data.length,
            active: data.filter((source) => source.isActive).length,
            disabled: data.filter((source) => !source.isActive).length,
            coolingDown: data.filter((source) => source.isCoolingDown).length,
            failing: data.filter((source) => source.consecutiveFailures > 0).length
        };

        res.json({ summary, data });
    } catch (error) {
        console.error('Error fetching source health:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /sources - Add source
router.post('/sources', limitAdminMutation, async (req, res) => {
    const validation = await validateSourcePayload(req.body);
    if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
    }

    const { name, url, category } = validation.data;

    try {
        const source = await prisma.source.create({
            data: { name, url, category }
        });

        // Fetch only the new source to avoid overlapping a global refresh.
        fetchAndProcessFeed(source).catch((error) => {
            console.error(`Error fetching newly added source "${source.name}":`, error);
        });

        res.status(201).json(source);
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ error: 'Source URL already exists.' });
        }

        res.status(400).json({ error: error.message });
    }
});

// POST /sources/:id/reactivate - reset failure state and reactivate source
router.post('/sources/:id/reactivate', limitAdminMutation, async (req, res) => {
    const sourceId = parseEntityId(req.params.id);
    if (sourceId === null) {
        return res.status(400).json({ error: 'Invalid source id.' });
    }

    try {
        const source = await prisma.source.update({
            where: { id: sourceId },
            data: {
                isActive: true,
                consecutiveFailures: 0,
                lastFailureAt: null,
                lastError: null,
                cooldownUntil: null
            }
        });
        res.json(source);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /sources/:id
router.delete('/sources/:id', limitAdminMutation, async (req, res) => {
    const sourceId = parseEntityId(req.params.id);
    if (sourceId === null) {
        return res.status(400).json({ error: 'Invalid source id.' });
    }

    try {
        await prisma.$transaction([
            prisma.article.deleteMany({ where: { sourceId } }),
            prisma.source.delete({ where: { id: sourceId } })
        ]);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /sources/refresh - Start an asynchronous refresh. GET must not mutate state.
router.post('/sources/refresh', limitAdminMutation, (req, res) => {
    const { alreadyRunning, status } = requestFeedRefresh();
    res.status(202).json({
        message: alreadyRunning ? 'Une synchronisation est déjà en cours.' : 'Synchronisation lancée.',
        status
    });
});

// POST /admin/repair-encoding - Walk the Article table and repair any field
// still tainted by UTF-8/Latin-1 mojibake. The fix is now applied in-band for
// new translations, but the historical rows that were stored before the fix
// (visible in the "Fuites de données" view as "donn\u00c3\u00a9es") need a
// one-shot sweep. Idempotent: only writes rows that actually changed.
const REPAIR_BATCH_SIZE_MAX = 500;
router.post('/admin/repair-encoding', requireAdmin, limitAdminMutation, async (req, res) => {
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
    const requestedBatch = Number.parseInt(req.body?.batchSize, 10);
    const batchSize = Number.isInteger(requestedBatch) && requestedBatch > 0
        ? Math.min(requestedBatch, REPAIR_BATCH_SIZE_MAX)
        : 100;

    try {
        if (dryRun) {
            // Detection-only pass: scan and tally without writing.
            const REPAIRABLE = ['title', 'originalTitle', 'content', 'summary', 'keywords'];
            const fieldCounts = Object.fromEntries(REPAIRABLE.map((field) => [field, 0]));
            let scanned = 0;
            let wouldRepair = 0;
            let lastId = 0;
            while (true) {
                const batch = await prisma.article.findMany({
                    where: { id: { gt: lastId } },
                    orderBy: { id: 'asc' },
                    take: batchSize,
                    select: {
                        id: true,
                        title: true,
                        originalTitle: true,
                        content: true,
                        summary: true,
                        keywords: true
                    }
                });
                if (batch.length === 0) break;
                for (const article of batch) {
                    scanned += 1;
                    lastId = article.id;
                    const { changed, fields } = repairArticleFieldsInPlace(article);
                    if (!changed) continue;
                    wouldRepair += 1;
                    for (const field of fields) {
                        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
                    }
                }
            }
            return res.json({
                dryRun: true,
                scanned,
                wouldRepair,
                fieldCounts
            });
        }

        const summary = await repairAllArticlesEncoding({ batchSize });
        return res.json({
            dryRun: false,
            ...summary
        });
    } catch (error) {
        console.error('Encoding repair failed:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

// GET /articles/stats - Get article count by category
router.get('/articles/stats', async (req, res) => {
    try {
        // Get all articles with their categories
        const maxAllowedDate = new Date(Date.now() + MAX_FUTURE_SKEW_MS);
        const breachExclusion = buildBreachExclusionWhere();
        const articles = await prisma.article.findMany({
            where: {
                date: { lte: maxAllowedDate },
                OR: [{ category: null }, { category: { not: 'Spam' } }],
                ...(breachExclusion || {})
            },
            select: {
                category: true,
                source: {
                    select: {
                        category: true
                    }
                }
            }
        });

        // Count articles per category
        const stats = {};
        articles.forEach(article => {
            const cat = article.category || article.source?.category || 'Autre';
            stats[cat] = (stats[cat] || 0) + 1;
        });

        // Calculate total
        const total = articles.length;

        res.json({ stats, total });
    } catch (error) {
        console.error('Error fetching article stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /articles/:id/summarize
router.post('/articles/:id/summarize', limitSummarization, async (req, res) => {
    const articleId = parseEntityId(req.params.id);
    if (articleId === null) {
        return res.status(400).json({ error: 'Invalid article id.' });
    }

    try {
        const article = await prisma.article.findUnique({ where: { id: articleId } });
        if (!article) return res.status(404).json({ error: "Article not found" });

        if (article.summary) {
            return res.json({ summary: repairMojibake(article.summary) });
        }

        const summaryCallback = await summarizeArticle(article.content || article.title);

        const updated = await prisma.article.update({
            where: { id: articleId },
            data: { summary: summaryCallback }
        });

        res.json({ summary: repairMojibake(updated.summary) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /articles/:id/bookmark - Toggle bookmark
router.post('/articles/:id/bookmark', async (req, res) => {
    const articleId = parseEntityId(req.params.id);
    if (articleId === null) {
        return res.status(400).json({ error: 'Invalid article id.' });
    }

    try {
        const article = await prisma.article.findUnique({ where: { id: articleId } });
        if (!article) return res.status(404).json({ error: "Article not found" });

        const updated = await prisma.article.update({
            where: { id: articleId },
            data: { isBookmarked: !article.isBookmarked }
        });

        res.json({ isBookmarked: updated.isBookmarked });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /bookmarks - Helper route for only bookmarks
router.get('/bookmarks', async (req, res) => {
    try {
        const maxAllowedDate = new Date(Date.now() + MAX_FUTURE_SKEW_MS);
        const bookmarks = await prisma.article.findMany({
            where: {
                isBookmarked: true,
                date: { lte: maxAllowedDate }
            },
            orderBy: { date: 'desc' },
            include: { source: true }
        });
        res.json(repairMojibakeDeep(bookmarks));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const { generateCategoryBrief } = require('./services/ai');

// GET /daily-brief - Generate daily highlights
router.get('/daily-brief', async (req, res) => {
    try {
        const dateKey = new Date().toISOString().slice(0, 10);
        const cachedBrief = await prisma.dailyBrief.findUnique({ where: { dateKey } });
        const isFresh = cachedBrief && (Date.now() - cachedBrief.updatedAt.getTime()) < 60 * 60 * 1000;

        if (isFresh) {
            try {
                // Repair any mojibake that was cached before the post-processing
                // guardrails were added (the cached JSON was generated by older
                // LLM responses that hadn't been re-decoded).
                const parsed = JSON.parse(cachedBrief.payload);
                return res.json(repairMojibakeDeep(parsed));
            } catch (error) {
                console.warn('Ignoring an invalid cached daily brief:', error.message);
            }
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // 1. Fetch articles from last 24h. Breach articles are intentionally
        // excluded: they live in their own dedicated page, the daily tech
        // brief must not surface them.
        const breachExclusion = buildBreachExclusionWhere();
        const articles = await prisma.article.findMany({
            where: {
                date: { gt: yesterday },
                category: { not: 'Spam' },
                ...(breachExclusion || {})
            },
            include: { source: true },
            orderBy: { date: 'desc' }
        });

        if (articles.length === 0) {
            return res.json([]);
        }

        // 2. Group by category
        // These must match exactly the labels produced by the AI classifier in services/ai.js
        const categories = ['Cybersecurité', 'Intelligence Artificielle', 'Cloud', 'Développement', 'Hardware', 'Web', 'Société', 'Business', 'Autre'];
        const groups = {};
        categories.forEach(c => groups[c] = []);

        // Distribute articles into their category bucket (fallback to 'Autre')
        articles.forEach(article => {
            const cat = article.category || article.source?.category;
            if (cat && groups[cat] !== undefined) {
                groups[cat].push(article);
            } else {
                groups['Autre'].push(article);
            }
        });

        // 3. Process each category (that has items)
        const briefs = [];
        const activeCategories = Object.keys(groups).filter(c => groups[c].length > 0);

        // Process sequentially to avoid hitting rate limits too hard
        for (const cat of activeCategories) {
            const catArticles = groups[cat];

            // Find a "Hero" image for this category (best quality from articles)
            const heroArticle = catArticles.find(a => a.image) || catArticles[0];
            const heroImage = heroArticle ? heroArticle.image : null;

            // Generate summary
            const summary = await generateCategoryBrief(cat, catArticles);

            briefs.push({
                category: cat,
                summary: summary,
                articleCount: catArticles.length,
                heroImage: heroImage,
                topArticles: catArticles.slice(0, 5) // Send top 5 metadata/links for context
            });
        }

        await prisma.dailyBrief.upsert({
            where: { dateKey },
            create: { dateKey, payload: JSON.stringify(briefs) },
            update: { payload: JSON.stringify(briefs) }
        });

        res.json(briefs);

    } catch (error) {
        console.error('Daily Brief Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /videos - Curated tech/IA videos from trusted channels
router.get('/videos', async (req, res) => {
    try {
        const limit = parseLimit(req.query.limit);
        const topics = parseTopics(req.query.topics);
        const query = typeof req.query.query === 'string' ? req.query.query : '';

        const payload = await fetchVideos({ query, topics, limit });
        res.json(payload);
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ error: 'Unable to fetch videos at this time.' });
    }
});

module.exports = router;
