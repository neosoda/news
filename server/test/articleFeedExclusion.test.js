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
            category: 'Fuites de donn\u00e9es',
            sourceId: anotherBreachSource.id
        }
    });

    return { techSource, breachSource, anotherBreachSource, techArticle, breachArticle, mismatchedBreachArticle };
}

test('GET /articles hides breach articles by default', async (t) => {
    await resetDatabase();
    const fixture = await seedFixture();

    const app = buildApp();
    const server = await new Promise((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    t.after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/articles?limit=50`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const ids = body.data.map((a) => a.id);

    assert.equal(body.pagination.total, 1, 'only the tech article must be in the default feed');
    assert.deepEqual(ids, [fixture.techArticle.id], 'breach articles must be excluded');
    assert.ok(!ids.includes(fixture.breachArticle.id), 'breach article with null category but breach source must be excluded');
    assert.ok(!ids.includes(fixture.mismatchedBreachArticle.id), 'breach-tagged article on a breach source must be excluded');
});

test('GET /articles?category=Fuites de donn\u00e9es returns breach articles only (Breaches page)', async (t) => {
    await resetDatabase();
    const fixture = await seedFixture();

    const app = buildApp();
    const server = await new Promise((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    t.after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/articles?limit=50&category=${encodeURIComponent('Fuites de donn\u00e9es')}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const ids = body.data.map((a) => a.id);

    assert.equal(body.pagination.total, 2, 'both breach articles must be returned for the dedicated page');
    assert.ok(ids.includes(fixture.breachArticle.id));
    assert.ok(ids.includes(fixture.mismatchedBreachArticle.id));
    assert.ok(!ids.includes(fixture.techArticle.id), 'tech article must not leak into the breach feed');
});

test('GET /articles/stats never reports breach category', async (t) => {
    await resetDatabase();
    await seedFixture();

    const app = buildApp();
    const server = await new Promise((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    t.after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/articles/stats`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.total, 1, 'total must reflect the general feed, not the breach feed');
    assert.equal(body.stats['Fuites de donn\u00e9es'], undefined, 'breach category must not appear in chips');
    assert.equal(body.stats['Cybersecurit\u00e9'], 1);
});

test('GET /articles with an explicit non-breach category still hides breach articles', async (t) => {
    await resetDatabase();
    const fixture = await seedFixture();

    const app = buildApp();
    const server = await new Promise((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    t.after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/articles?limit=50&category=Cybersecurit%C3%A9`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const ids = body.data.map((a) => a.id);

    assert.equal(body.pagination.total, 1, 'asking for Cybersecurit\u00e9 must not return breach articles');
    assert.deepEqual(ids, [fixture.techArticle.id]);
});

test('GET /daily-brief does not surface breach articles', async (t) => {
    await resetDatabase();
    const fixture = await seedFixture();

    const app = buildApp();
    const server = await new Promise((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    t.after(async () => {
        // Clean the daily-brief cache so the test always rebuilds.
        await prisma.dailyBrief.deleteMany({});
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/daily-brief`);
    assert.equal(response.status, 200);
    const briefs = await response.json();

    const breachMentioned = briefs.some((brief) => brief.category === 'Fuites de donn\u00e9es');
    assert.equal(breachMentioned, false, 'no brief may be generated for the breach category');

    for (const brief of briefs) {
        assert.notEqual(brief.category, 'Fuites de donn\u00e9es');
    }

    // The fixture breach article must not appear in any brief's topArticles.
    const allTopIds = briefs.flatMap((b) => (b.topArticles || []).map((a) => a.id));
    assert.ok(!allTopIds.includes(fixture.breachArticle.id));
    assert.ok(!allTopIds.includes(fixture.mismatchedBreachArticle.id));
    // Suppress unused-variable lint while still asserting the fixture is loaded.
    assert.ok(fixture.techArticle);
});
