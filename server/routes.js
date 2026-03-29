const express = require('express');
const router = express.Router();
const { updateAllFeeds } = require('./services/rss');
const { summarizeArticle } = require('./services/ai');
const { fetchVideos, parseLimit, parseTopics } = require('./services/videos');
const prisma = require('./db');

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Health check
router.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'OK', database: 'connected' });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ status: 'ERROR', database: 'disconnected', error: error.message });
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
    const conditions = [{ date: { lte: maxAllowedDate } }];

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

    // Combiner toutes les conditions avec AND
    if (conditions.length > 0) {
        where.AND = conditions;
    }

    try {
        const articles = await prisma.article.findMany({
            where,
            orderBy: { date: 'desc' },
            take: limit,
            skip: (page - 1) * limit,
            include: { source: true }
        });

        const total = await prisma.article.count({ where });

        res.json({
            data: articles,
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

// GET /sources - List sources
router.get('/sources', async (req, res) => {
    try {
        const sources = await prisma.source.findMany();
        res.json(sources);
    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /sources - Add source
router.post('/sources', async (req, res) => {
    const { name, url, category } = req.body;
    try {
        const source = await prisma.source.create({
            data: { name, url, category }
        });
        // Fetch immediately
        updateAllFeeds().catch(console.error);
        res.json(source);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /sources/:id
router.delete('/sources/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sourceId = parseInt(id);
        await prisma.$transaction([
            prisma.article.deleteMany({ where: { sourceId } }),
            prisma.source.delete({ where: { id: sourceId } })
        ]);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// GET /sources/refresh
router.get('/sources/refresh', async (req, res) => {
    try {
        const count = await updateAllFeeds();
        res.json({ message: `Refreshed all feeds. ${count} new articles.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /articles/stats - Get article count by category
router.get('/articles/stats', async (req, res) => {
    try {
        // Get all articles with their categories
        const maxAllowedDate = new Date(Date.now() + MAX_FUTURE_SKEW_MS);
        const articles = await prisma.article.findMany({
            where: { date: { lte: maxAllowedDate } },
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
router.post('/articles/:id/summarize', async (req, res) => {
    const { id } = req.params;
    try {
        const article = await prisma.article.findUnique({ where: { id: parseInt(id) } });
        if (!article) return res.status(404).json({ error: "Article not found" });

        if (article.summary) {
            return res.json({ summary: article.summary });
        }

        const summaryCallback = await summarizeArticle(article.content || article.title);

        const updated = await prisma.article.update({
            where: { id: parseInt(id) },
            data: { summary: summaryCallback }
        });

        res.json({ summary: updated.summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /articles/:id/bookmark - Toggle bookmark
router.post('/articles/:id/bookmark', async (req, res) => {
    const { id } = req.params;
    try {
        const article = await prisma.article.findUnique({ where: { id: parseInt(id) } });
        if (!article) return res.status(404).json({ error: "Article not found" });

        const updated = await prisma.article.update({
            where: { id: parseInt(id) },
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
        res.json(bookmarks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const { generateCategoryBrief } = require('./services/ai');

// GET /daily-brief - Generate daily highlights
router.get('/daily-brief', async (req, res) => {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // 1. Fetch articles from last 24h
        const articles = await prisma.article.findMany({
            where: {
                date: { gt: yesterday },
                category: { not: 'Spam' }
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
