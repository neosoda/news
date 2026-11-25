const express = require('express');
const router = express.Router();
const { fetchAndProcessFeed } = require('./services/rss');
const { summarizeArticle } = require('./services/ai');
const { fetchVideos, parseLimit, parseTopics } = require('./services/videos');
const { validateOutboundHttpUrl } = require('./services/urlSafety');
const { getCanonicalFeedUrl, getUnsupportedFeedReason } = require('./services/feedUrlCatalog');
const { requireAdmin, limitAdminMutation, limitSummarization, limitAIGeneration, limitVideos } = require('./services/adminAuth');
const {
    getFeedUpdateStatus,
    requestFeedRefresh,
    repairAllArticlesEncoding,
    repairArticleFieldsInPlace
} = require('./services/rss');
const { repairMojibake, repairMojibakeDeep } = require('./services/encoding');
const prisma = require('./db');
const { buildEditorial } = require('./services/editorial');
const { getCatalog } = require('./services/kev');
const { cachedBriefValid } = require('./services/briefQuality');

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
            { OR: [{ category: null }, { category: { notIn: [...BREACH_CATEGORY_VALUES] } }] },
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
    if (!/^\d+$/.test(String(value))) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2147483647 ? parsed : fallback;
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
router.get('/articles', (req, res, next) => req.query.bookmarked === 'true' ? requireAdmin(req, res, next) : next(), async (req, res) => {
    const page = Math.min(parsePositiveInt(req.query.page, 1), 10000);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const sourceId = parsePositiveInt(req.query.sourceId, null);
    const excludedSources = typeof req.query.excludeSources==='string' ? [...new Set(req.query.excludeSources.split(',').slice(0,100).map(v=>parsePositiveInt(v,null)).filter(Boolean))] : [];
    const maxAllowedDate = new Date(Date.now() + MAX_FUTURE_SKEW_MS);

    const where = {};
    const conditions = [
        { date: { lte: maxAllowedDate } },
        { OR: [{ category: null }, { category: { not: 'Spam' } }] }
    ];

    // Every term must match at least one searchable field.
    const terms = search.split(/\s+/).filter(Boolean).slice(0,8);
    for (const term of terms) conditions.push({ OR: [
        { title: { contains: term } }, { originalTitle: { contains: term } },
        { content: { contains: term } }, { summary: { contains: term } }
    ] });
    const period = { '24h':86400000, '7d':604800000, '30d':2592000000 }[req.query.period];
    if (typeof period === 'number') conditions.push({ date: { gte:new Date(Date.now()-period) } });

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
    } else if (excludedSources.length) {
        conditions.push({ sourceId: { notIn: excludedSources } });
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
            include: { source: { select: { id:true,name:true,image:true,category:true } } }
        });

        const total = await prisma.article.count({ where });

        res.json({
            data: repairMojibakeDeep(rankArticlesForDailyScan(articles).map(({ isBookmarked, ...article }) => ({ ...article, isBookmarked: req.query.bookmarked === 'true' && isBookmarked }))),
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
    }
});

// Bounded editorial analysis: no LLM calls and no database mutations.
let editorialCache = null;
let editorialPending = null;
router.get('/editorial', async (req, res) => {
    try {
        if (!editorialCache || Date.now() - editorialCache.at > 300000) {
            if (!editorialPending) {
                editorialPending = (async () => {
                    const now = Date.now();
                    const rows = await prisma.article.findMany({
                        where: {
                            date: { gte: new Date(now - 2 * 86400000), lte: new Date(now) },
                            AND: [
                                { OR: [{ category: null }, { category: { not: 'Spam' } }] },
                                ...buildBreachExclusionWhere().AND
                            ]
                        },
                        select: {
                            id: true,
                            title: true,
                            link: true,
                            date: true,
                            image: true,
                            category: true,
                            sourceId: true,
                            source: { select: { name: true, category: true } }
                        },
                        orderBy: [{ date: 'desc' }, { id: 'desc' }],
                        take: 500
                    });
                    editorialCache = { at: now, payload: buildEditorial(rows, now) };
                })().finally(() => {
                    editorialPending = null;
                });
            }
            await editorialPending;
        }
        res.json(repairMojibakeDeep(editorialCache.payload));
    } catch (error) {
        console.error('Editorial analysis failed:', error);
        res.status(503).json({ error: 'Analyse éditoriale indisponible.' });
    }
});

router.get('/article-sources', async (req, res) => {
    try {
        const sources = await prisma.source.findMany({
            where: {
                category: { notIn: [...BREACH_CATEGORY_VALUES] },
                articles: { some: {} }
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        });
        res.json(repairMojibakeDeep(sources));
    } catch (error) {
        console.error('Public source list failed:', error);
        res.status(503).json({ error: 'Sources indisponibles.' });
    }
});

router.get('/cyber/kev', async (req, res) => {
    try {
        const catalog = await getCatalog();
        const search = normalizeInput(req.query.search, 120).toLowerCase();
        const onlyRansomware = req.query.ransomware === 'known';
        const ransomwareTotal = catalog.entries.filter((entry) => entry.ransomware === 'Known').length;

        const entries = catalog.entries.filter((vuln) => {
            if (onlyRansomware && vuln.ransomware !== 'Known') {
                return false;
            }
            if (!search) {
                return true;
            }
            return [vuln.cve, vuln.vendor, vuln.product, vuln.name].some((field) =>
                field.toLowerCase().includes(search)
            );
        });

        const page = Math.min(parsePositiveInt(req.query.page, 1), 10000);
        const pageSize = 30;
        const { entries: allEntries, ...meta } = catalog;

        res.json({
            data: entries.slice((page - 1) * pageSize, page * pageSize),
            meta: {
                ...meta,
                total: entries.length,
                catalogSize: allEntries.length,
                ransomwareTotal,
                page,
                pages: Math.ceil(entries.length / pageSize)
            }
        });
    } catch (error) {
        console.error('KEV unavailable:', error.message);
        res.status(503).json({ error: 'Catalogue CISA indisponible.' });
    }
});

router.get('/cyber/cert', async (req, res) => {
    try {
        const search = normalizeInput(req.query.search, 120).toLowerCase();
        const rows = await prisma.article.findMany({
            where: {
                source: { name: { startsWith: 'CERT-FR' } },
                date: { lte: new Date() },
                OR: [{ category: null }, { category: { not: 'Spam' } }]
            },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            take: 40,
            select: {
                id: true,
                title: true,
                link: true,
                date: true,
                content: true,
                source: { select: { name: true } }
            }
        });

        // Cross-reference against already-cached KEV CVEs without adding external latency.
        const kevCveSet = typeof getCatalog.getCachedCveSet === 'function' ? getCatalog.getCachedCveSet() : new Set();

        const formatted = rows
            .map(({ content, ...article }) => {
                const cves = [
                    ...new Set(
                        (`${article.title} ${content || ''}`).match(/\bCVE-\d{4}-\d{4,}\b/gi) || []
                    )
                ]
                    .map((cve) => cve.toUpperCase())
                    .slice(0, 20);
                const kevMatches = cves.filter((cve) => kevCveSet.has(cve));
                return { ...article, cves, kevMatches };
            })
            .filter((article) => {
                if (!search) return true;
                return (
                    article.title.toLowerCase().includes(search) ||
                    article.cves.some((cve) => cve.toLowerCase().includes(search))
                );
            });

        res.json(repairMojibakeDeep(formatted));
    } catch (error) {
        console.error('CERT feed unavailable:', error.message);
        res.status(503).json({ error: 'Flux CERT-FR indisponible.' });
    }
});

router.get('/source-observatory', async (req, res) => {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 7 * 86400000);
        const sources = await prisma.source.findMany({
            select: {
                id: true,
                name: true,
                category: true,
                isActive: true,
                lastFetched: true,
                cooldownUntil: true,
                consecutiveFailures: true
            }
        });
        const counts = await prisma.article.groupBy({
            by: ['sourceId'],
            where: {
                date: { gte: cutoff, lte: now },
                OR: [{ category: null }, { category: { not: 'Spam' } }]
            },
            _count: { _all: true },
            _max: { date: true }
        });
        const index = new Map(counts.map((item) => [item.sourceId, item]));
        const payload = sources
            .map(({ cooldownUntil, ...source }) => ({
                ...source,
                isCoolingDown: Boolean(cooldownUntil && new Date(cooldownUntil) > now),
                articles7d: index.get(source.id)?._count._all || 0,
                lastArticle: index.get(source.id)?._max.date || null
            }))
            .sort((a, b) => b.articles7d - a.articles7d || a.name.localeCompare(b.name));

        res.json(repairMojibakeDeep(payload));
    } catch (error) {
        console.error('Observatory failed:', error);
        res.status(503).json({ error: 'Observatoire indisponible.' });
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
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
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
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
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

        res.status(400).json({ error: 'La requête n’a pas pu être traitée.' });
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
        res.status(400).json({ error: 'La requête n’a pas pu être traitée.' });
    }
});

// DELETE /sources/:id
router.delete('/sources/:id', limitAdminMutation, async (req, res) => {
    const sourceId = parseEntityId(req.params.id);
    if (sourceId === null) {
        return res.status(400).json({ error: 'Invalid source id.' });
    }

    try {
        const removed = await prisma.$transaction(async tx => {
            if (await tx.article.count({ where: { sourceId, isBookmarked: true } })) return false;
            await tx.article.deleteMany({ where: { sourceId } });
            await tx.source.delete({ where: { id: sourceId } });
            return true;
        });
        if (!removed) return res.status(409).json({ error: 'Cette source contient des favoris historiques. Retirez-les avant la suppression.' });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: 'La requête n’a pas pu être traitée.' });
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
        return res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
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
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
    }
});

// POST /articles/:id/summarize
const pendingSummaries = new Map();
router.post('/articles/:id/summarize', limitSummarization, limitAIGeneration, async (req, res) => {
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

        let pending = pendingSummaries.get(articleId);
        if (!pending) {
            if (pendingSummaries.size >= 4) return res.status(429).json({ error: 'Résumés occupés. Réessayez plus tard.' });
            pending = (async () => {
                const summary = await summarizeArticle(article.content || article.title);
                return prisma.article.update({ where: { id: articleId }, data: { summary } });
            })().finally(() => pendingSummaries.delete(articleId));
            pendingSummaries.set(articleId, pending);
        }
        const updated = await pending;
        res.json({ summary: repairMojibake(updated.summary) });
    } catch (error) {
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
    }
});

// POST /articles/:id/bookmark - Toggle bookmark
router.post('/articles/:id/bookmark', requireAdmin, limitAdminMutation, async (req, res) => {
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
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
    }
});

// GET /bookmarks - Helper route for only bookmarks
router.get('/bookmarks', requireAdmin, async (req, res) => {
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
        res.status(500).json({ error: 'La requête n’a pas pu être traitée.' });
    }
});

const { generateCategoryBrief, BRIEF_SOURCE_LIMIT } = require('./services/ai');

// GET /daily-brief - Generate daily highlights
const pendingBriefs = new Map();
let nextBriefAttemptAt = 0;
async function buildDailyBrief(dateKey) {
        const cachedBrief = await prisma.dailyBrief.findUnique({ where: { dateKey } });
        const isFresh = cachedBrief && (Date.now() - cachedBrief.updatedAt.getTime()) < 60 * 60 * 1000;

        if (isFresh) {
            try {
                // Repair any mojibake that was cached before the post-processing
                // guardrails were added (the cached JSON was generated by older
                // LLM responses that hadn't been re-decoded).
                const parsed = JSON.parse(cachedBrief.payload);
                if (cachedBriefValid(parsed)) return repairMojibakeDeep(parsed);
            } catch (error) {
                console.warn('Ignoring an invalid cached daily brief:', error.message);
            }
        }

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // 1. Fetch articles from last 24h. Breach articles are intentionally
        // excluded: they live in their own dedicated page, the daily tech
        // brief must not surface them.
        const breachExclusion = buildBreachExclusionWhere();
        const articles = await prisma.article.findMany({
            where: {
                date: { gt: yesterday, lte: new Date(Date.now() + MAX_FUTURE_SKEW_MS) },
                AND: [{ OR: [{ category: null }, { category: { not: 'Spam' } }] }, ...(breachExclusion?.AND || [])]
            },
            include: { source: true },
            orderBy: { date: 'desc' }
        });

        if (articles.length === 0) {
            return [];
        }

        // 2. Group by category
        // These must match exactly the labels produced by the AI classifier in services/ai.js
        const categories = ['Cybersecurité', 'Intelligence Artificielle', 'Cloud', 'Développement', 'Hardware', 'Web', 'Société', 'Business', 'Autre'];
        const groups = {};
        categories.forEach(c => groups[c] = []);

        // Distribute articles into their category bucket (fallback to 'Autre')
        articles.forEach(article => {
            const cat = article.category || article.source?.category;
            if (cat && Object.hasOwn(groups, cat)) {
                groups[cat].push(article);
            } else {
                groups['Autre'].push(article);
            }
        });

        // 3. Process each category (that has items)
        const briefs = [];
        const activeCategories = Object.keys(groups).filter(c => groups[c].length > 0);

        // Process sequentially to avoid hitting rate limits too hard.
        // Isolate per-category failures so one invalid LLM output does not abort the full edition.
        let lastCategoryError = null;
        for (const cat of activeCategories) {
            const catArticles = groups[cat];

            // Find a "Hero" image for this category (best quality from articles)
            const heroArticle = catArticles.find(a => a.image) || catArticles[0];
            const heroImage = heroArticle ? heroArticle.image : null;

            try {
                const summary = await generateCategoryBrief(cat, catArticles);

                briefs.push({
                    category: cat,
                    summary: summary,
                    articleCount: catArticles.length,
                    heroImage: heroImage,
                    // Same order as the numbered list given to the model: [n] -> topArticles[n - 1]
                    topArticles: catArticles.slice(0, BRIEF_SOURCE_LIMIT).map(a => ({
                        id: a.id,
                        title: a.title,
                        link: a.link,
                        date: a.date,
                        source: a.source ? { name: a.source.name } : null
                    }))
                });
            } catch (error) {
                lastCategoryError = error;
                console.error(`Skipping daily brief category "${cat}":`, error.message);
            }
        }

        if (briefs.length === 0) {
            throw lastCategoryError || new Error('Daily brief generation failed for all categories');
        }

        await prisma.dailyBrief.upsert({
            where: { dateKey },
            create: { dateKey, payload: JSON.stringify(briefs) },
            update: { payload: JSON.stringify(briefs) }
        });

        return briefs;
}

function parisDateKey() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const part = (type) => parts.find((item) => item.type === type).value;
    return [part('year'), part('month'), part('day')].join('-');
}

function requestDailyBrief(dateKey = parisDateKey()) {
    let pending = pendingBriefs.get(dateKey);
    if (!pending && Date.now() >= nextBriefAttemptAt) {
        pending = buildDailyBrief(dateKey)
            .catch((error) => {
                nextBriefAttemptAt = Date.now() + 60000;
                throw error;
            })
            .finally(() => {
                pendingBriefs.delete(dateKey);
            });
        pendingBriefs.set(dateKey, pending);
    }
    return pending || Promise.reject(new Error('brief_retry_cooldown'));
}

router.get('/daily-brief', limitSummarization, async (req, res) => {
    const dateKey = parisDateKey();
    try {
        res.json(await requestDailyBrief(dateKey));
    } catch (error) {
        console.error('Daily Brief Error:', error);
        const cached = await prisma.dailyBrief.findUnique({ where: { dateKey } }).catch(() => null);
        if (cached) {
            try {
                const parsed = JSON.parse(cached.payload);
                if (cachedBriefValid(parsed)) {
                    res.set('X-Brief-Stale', 'true');
                    return res.json(repairMojibakeDeep(parsed));
                }
            } catch {
                // Invalid cached payload
            }
        }
        res.status(503).json({ error: 'Brief temporairement indisponible.' });
    }
});

router.get('/brief-archive', async (req, res) => {
    try {
        const rows = await prisma.dailyBrief.findMany({
            orderBy: { dateKey: 'desc' },
            take: 90,
            select: { dateKey: true, updatedAt: true, payload: true }
        });
        const valid = rows
            .filter((row) => {
                try {
                    return cachedBriefValid(JSON.parse(row.payload));
                } catch {
                    return false;
                }
            })
            .map(({ dateKey, updatedAt }) => ({ dateKey, updatedAt }));
        res.json(valid);
    } catch (error) {
        console.error('Brief archive failed:', error);
        res.status(503).json({ error: 'Archives indisponibles.' });
    }
});

router.get('/brief-archive/:date', async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
        return res.status(400).json({ error: 'Date invalide.' });
    }
    try {
        const row = await prisma.dailyBrief.findUnique({ where: { dateKey: req.params.date } });
        if (!row) {
            return res.status(404).json({ error: 'Édition introuvable.' });
        }
        const briefs = JSON.parse(row.payload);
        if (!cachedBriefValid(briefs)) {
            return res.status(404).json({ error: 'Édition indisponible.' });
        }
        res.json(repairMojibakeDeep(briefs));
    } catch (error) {
        console.error('Brief edition failed:', error);
        res.status(503).json({ error: 'Édition indisponible.' });
    }
});

// GET /videos - Curated tech/IA videos from trusted channels
router.get('/videos', limitVideos, async (req, res) => {
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
module.exports.requestDailyBrief = requestDailyBrief;
