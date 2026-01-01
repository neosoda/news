const express = require('express');
const router = express.Router();
const { updateAllFeeds } = require('./services/rss');
const { summarizeArticle } = require('./services/ai');
const prisma = require('./db');

// GET /articles - List articles with pagination and search
router.get('/articles', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const category = req.query.category || '';

    const where = {};
    if (search) {
        where.OR = [
            { title: { contains: search } },
            { content: { contains: search } }
        ];
    }
    if (category) {
        where.source = { category: category };
    }
    if (req.query.sourceId) {
        where.sourceId = parseInt(req.query.sourceId);
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
        res.status(500).json({ error: error.message });
    }
});

// GET /sources - List sources
router.get('/sources', async (req, res) => {
    try {
        const sources = await prisma.source.findMany();
        res.json(sources);
    } catch (error) {
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

module.exports = router;
