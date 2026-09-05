process.env.SQLITE_URL = 'file:' + require('path').join(require('os').tmpdir(), 'newsai-breach-exclusion-test.db').replace(/\\/g, '/');
process.env.ADMIN_TOKEN = 'breach-exclusion-test-token-with-at-least-32-characters';

const express = require('express');
const routes = require('../routes');
const prisma = require('../db');

async function main() {
    // Clean up
    await prisma.article.deleteMany({});
    await prisma.source.deleteMany({});
    console.log('DB reset OK');

    // Seed
    const techSource = await prisma.source.create({
        data: { name: 'Tech', url: 'https://example.com/tech', category: 'Cybersecurité' }
    });
    const breachSource = await prisma.source.create({
        data: { name: 'Breach', url: 'https://example.com/breach', category: 'Fuites de données' }
    });
    const techArticle = await prisma.article.create({
        data: {
            title: 'CVE',
            link: 'https://example.com/tech/cve',
            date: new Date(),
            category: 'Cybersecurité',
            sourceId: techSource.id
        }
    });
    const breachArticle = await prisma.article.create({
        data: {
            title: 'Breach',
            link: 'https://example.com/breach/y',
            date: new Date(),
            category: null,
            sourceId: breachSource.id
        }
    });
    console.log('Seeded:', { techArticle: techArticle.id, breachArticle: breachArticle.id });

    // Start server
    const app = express();
    app.use(express.json());
    app.use('/api', routes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    console.log('Server listening on port', server.address().port);

    const origin = `http://127.0.0.1:${server.address().port}`;

    // Test 1: /articles without category
    console.log('--- Test 1: /articles (no category) ---');
    const r1 = await fetch(`${origin}/api/articles?limit=50`);
    const b1 = await r1.json();
    console.log('Status:', r1.status, 'Total:', b1.pagination?.total, 'IDs:', b1.data?.map((a) => a.id));

    // Test 2: /articles with category=Fuites de données
    console.log('--- Test 2: /articles?category=Fuites de donn\u00e9es ---');
    const r2 = await fetch(`${origin}/api/articles?limit=50&category=${encodeURIComponent('Fuites de donn\u00e9es')}`);
    const b2 = await r2.json();
    console.log('Status:', r2.status, 'Total:', b2.pagination?.total, 'IDs:', b2.data?.map((a) => a.id));

    // Test 3: /articles/stats
    console.log('--- Test 3: /articles/stats ---');
    const r3 = await fetch(`${origin}/api/articles/stats`);
    const b3 = await r3.json();
    console.log('Status:', r3.status, 'Body:', b3);

    server.close();
    await prisma.$disconnect();
    console.log('Done.');
    process.exit(0);
}

main().catch((err) => {
    console.error('FAIL:', err.message);
    console.error(err.stack);
    process.exit(1);
});
