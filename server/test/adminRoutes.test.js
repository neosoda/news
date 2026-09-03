const path = require('path');
const os = require('os');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SQLITE_URL = `file:${path.join(os.tmpdir(), 'newsai-admin-route-test.db').replace(/\\/g, '/')}`;
process.env.ADMIN_TOKEN = 'admin-route-test-token-with-at-least-32-characters';

const express = require('express');
const routes = require('../routes');
const prisma = require('../db');

test('source management endpoints reject unauthenticated requests before accessing data', async (t) => {
    const app = express();
    app.use(express.json());
    app.use('/api', routes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    t.after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const pathName of ['/api/sources', '/api/sources/health', '/api/sources/refresh']) {
        const response = await fetch(`${origin}${pathName}`, { method: pathName.endsWith('/refresh') ? 'POST' : 'GET' });
        assert.equal(response.status, 401, pathName);
    }
});
