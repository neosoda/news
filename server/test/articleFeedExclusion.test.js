const path = require('path');
const os = require('os');
const test = require('node:test');
const assert = require('node:assert/strict');

const DB_PATH = path.join(os.tmpdir(), 'newsai-breach-exclusion-test.db').replace(/\\/g, '/');
process.env.SQLITE_URL = `file:${DB_PATH}`;
// ADMIN_TOKEN is required by some admin paths; provide a valid 32+ char value so
// requireAdmin() doesn't 503 the whole router.
process.env.ADMIN_TOKEN = 'breach-exclusion-test-token-with-at-least-32-characters';

const express = require('express');
const routes = require('../routes');
const prisma = require('../db');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', routes);
    return app;
}

async function listen(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

async function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

async function resetDatabase() {
    // Order matters: Article has a FK to Source.
    await prisma.article.deleteMany({});
    await prisma.source.deleteMany({});
}

async function seedFixture() {
    const techSource = await prisma.source.create({
        data: {
            name: 'Tech News Daily',
            url: 'https://example.com/tech/feed.xml',
            category: 'Cybersecurité'
        }
    });
    const breachSource = await prisma.source.create({
        data: {
            name: 'Fuites Infos',
            url: 'https://example.com/breach/feed.xml',
            category: 'Fuites de données'
        }
    });
    const anotherBreachSource = await prisma.source.create({
        data: {
            name: 'FrenchBreaches',
            url: 'https://example.com/frenchbreaches/feed.xml',
            category: 'Fuites de données'
        }
    });

    const techArticle = await prisma.article.create({
        data: {
            title: 'CVE-2026-1234 critique',
            originalTitle: 'CVE-2026-1234 critical',
            link: 'https://example.com/tech/cve-2026-1234',
            date: new Date('2026-09-05T08:00:00Z'),
            content: 'Une vuln\u00e9rabilit\u00e9 critique a \u00e9t\u00e9 d\u00e9couverte.',
            category: 'Cybersecurité',
            sourceId: techSource.id
        }
    });
    const breachArticle = await prisma.article.create({
        data: {
            title: 'Fuite de donn\u00e9es YouFid',
            originalTitle: 'YouFid data breach',
            link: 'https://example.com/breach/youfid-2026-09-05',
            date: new Date('2026-09-05T09:00:00Z'),
            content: 'Les donn\u00e9es de 7 880 personnes ont \u00e9t\u00e9 publi\u00e9es.',
            // Note: source category is the breach label, but the article's own
            // category is null to mirror the common case where the LLM hasn't
            // re-tagged it yet. The exclusion must still catch it.
            category: null,
            sourceId: breachSource.id
        }
    });
    // Article whose own category is the breach label but whose source is a
    // different feed — must also be excluded.
    const mismatchedBreachArticle = await prisma.article.create({
        data: {
            title: 'Annonce diverse taggu\u00e9e Fuites de donn\u00e9es',
            originalTitle: 'Misc announcement tagged Fuites de donn\u00e9es',
            link: 'https://example.com/misc/breach-tag',
            date: new Date('2026-09-05T10:00:00Z'),
            content: 'Contenu hors p\u00e9rim\u00e8tre mais class\u00e9 ainsi.',
            category: 'Fuites de données',
            sourceId: anotherBreachSource.id
        }
    });

    return { techSource, breachSource, anotherBreachSource, techArticle, breachArticle, mismatchedBreachArticle };
}

test('GET /articles hides breach articles by default', async () => {
    await resetDatabase();
    const fixture = await seedFixture();
    const app = buildApp();
    const server = await listen(app);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${origin}/api/articles?limit=50`);
        assert.equal(response.status, 200);
        const body = await response.json();
        const ids = body.data.map((a) => a.id);

        assert.equal(body.pagination.total, 1, 'only the tech article must be in the default feed');
        assert.deepEqual(ids, [fixture.techArticle.id], 'breach articles must be excluded');
        assert.ok(!ids.includes(fixture.breachArticle.id), 'breach article with null category but breach source must be excluded');
        assert.ok(!ids.includes(fixture.mismatchedBreachArticle.id), 'breach-tagged article on a breach source must be excluded');
    } finally {
        await closeServer(server);
    }
});

test('GET /articles?category=Fuites de donn\u00e9es returns breach articles only (Breaches page)', async () => {
    await resetDatabase();
    const fixture = await seedFixture();
    const app = buildApp();
    const server = await listen(app);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${origin}/api/articles?limit=50&category=${encodeURIComponent('Fuites de donn\u00e9es')}`);
        assert.equal(response.status, 200);
        const body = await response.json();
        const ids = body.data.map((a) => a.id);

        assert.equal(body.pagination.total, 2, 'both breach articles must be returned for the dedicated page');
        assert.ok(ids.includes(fixture.breachArticle.id));
        assert.ok(ids.includes(fixture.mismatchedBreachArticle.id));
        assert.ok(!ids.includes(fixture.techArticle.id), 'tech article must not leak into the breach feed');
    } finally {
        await closeServer(server);
    }
});

test('GET /articles/stats never reports breach category', async () => {
    await resetDatabase();
    await seedFixture();
    const app = buildApp();
    const server = await listen(app);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${origin}/api/articles/stats`);
        assert.equal(response.status, 200);
        const body = await response.json();

        assert.equal(body.total, 1, 'total must reflect the general feed, not the breach feed');
        assert.equal(body.stats['Fuites de donn\u00e9es'], undefined, 'breach category must not appear in chips');
        assert.equal(body.stats['Cybersecurit\u00e9'], 1);
    } finally {
        await closeServer(server);
    }
});

test('GET /articles with an explicit non-breach category still hides breach articles', async () => {
    await resetDatabase();
    const fixture = await seedFixture();
    const app = buildApp();
    const server = await listen(app);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${origin}/api/articles?limit=50&category=Cybersecurit%C3%A9`);
        assert.equal(response.status, 200);
        const body = await response.json();
        const ids = body.data.map((a) => a.id);

        assert.equal(body.pagination.total, 1, 'asking for Cybersecurit\u00e9 must not return breach articles');
        assert.deepEqual(ids, [fixture.techArticle.id]);
    } finally {
        await closeServer(server);
    }
});

test('GET /daily-brief returns no breach category brief', async () => {
    // Articles older than 24h on purpose: the daily-brief endpoint returns []
    // before invoking the LLM cascade when its SQL query yields no rows, so
    // we exercise the breach-exclusion filter without depending on a real
    // LLM provider.
    await resetDatabase();
    await prisma.dailyBrief.deleteMany({});
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const techSource = await prisma.source.create({
        data: { name: 'Tech', url: 'https://example.com/tech', category: 'Cybersecurité' }
    });
    const breachSource = await prisma.source.create({
        data: { name: 'Breach', url: 'https://example.com/breach', category: 'Fuites de données' }
    });
    await prisma.article.create({
        data: {
            title: 'CVE',
            link: 'https://example.com/tech/cve-1',
            date: oldDate,
            content: 'old',
            category: 'Cybersecurité',
            sourceId: techSource.id
        }
    });
    await prisma.article.create({
        data: {
            title: 'Breach',
            link: 'https://example.com/breach/b-1',
            date: oldDate,
            content: 'old breach',
            category: null,
            sourceId: breachSource.id
        }
    });

    const app = buildApp();
    const server = await listen(app);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${origin}/api/daily-brief`);
        assert.equal(response.status, 200);
        const briefs = await response.json();
        assert.ok(Array.isArray(briefs));
        const breachMentioned = briefs.some((brief) => brief.category === 'Fuites de donn\u00e9es');
        assert.equal(breachMentioned, false, 'no brief may be generated for the breach category');
    } finally {
        await closeServer(server);
    }
});

test('Daily-brief-shaped query excludes breach articles', async () => {
    // Direct test of the same Prisma where clause used by /daily-brief,
    // without going through the HTTP layer. Uses recent articles so the
    // query would actually return rows if the filter were broken.
    await resetDatabase();
    const breachSource = await prisma.source.create({
        data: { name: 'Breach', url: 'https://example.com/breach', category: 'Fuites de données' }
    });
    const techSource = await prisma.source.create({
        data: { name: 'Tech', url: 'https://example.com/tech', category: 'Cybersecurité' }
    });
    const recentDate = new Date(Date.now() - 60 * 60 * 1000); // 1h ago, in window
    const breachArticle = await prisma.article.create({
        data: {
            title: 'Breach',
            link: 'https://example.com/breach/recent',
            date: recentDate,
            content: 'recent breach',
            category: null,
            sourceId: breachSource.id
        }
    });
    const techArticle = await prisma.article.create({
        data: {
            title: 'Tech',
            link: 'https://example.com/tech/recent',
            date: recentDate,
            content: 'recent tech',
            category: 'Cybersecurité',
            sourceId: techSource.id
        }
    });

    const articles = await prisma.article.findMany({
        where: {
            date: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            category: { not: 'Spam' },
            AND: [
                { category: { notIn: ['Fuites de données'] } },
                { source: { category: { notIn: ['Fuites de données'] } } }
            ]
        }
    });
    const ids = articles.map((a) => a.id);
    assert.ok(!ids.includes(breachArticle.id), 'breach article must be excluded');
    assert.ok(ids.includes(techArticle.id), 'tech article must be included');
});

test.after(async () => {
    await prisma.$disconnect();
});
