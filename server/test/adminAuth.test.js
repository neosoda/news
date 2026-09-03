const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorsOptions, requireAdmin } = require('../services/adminAuth');

function callAdminMiddleware(token) {
    const response = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let nextCalled = false;
    requireAdmin({ get: () => token, ip: '127.0.0.1' }, response, () => { nextCalled = true; });
    return { response, nextCalled };
}

function restoreEnv(name, value) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

test('admin middleware locks management routes when no server token is configured', () => {
    const originalToken = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { response, nextCalled } = callAdminMiddleware('any-token');
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'admin_auth_not_configured');
    assert.equal(nextCalled, false);
    restoreEnv('ADMIN_TOKEN', originalToken);
});

test('admin middleware rejects missing and invalid tokens', () => {
    const originalToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = 'a'.repeat(32);
    assert.equal(callAdminMiddleware('').response.statusCode, 401);
    assert.equal(callAdminMiddleware('b'.repeat(32)).response.statusCode, 403);
    restoreEnv('ADMIN_TOKEN', originalToken);
});

test('admin middleware permits the configured token', () => {
    const originalToken = process.env.ADMIN_TOKEN;
    const token = 'secure-admin-token-with-at-least-32-characters';
    process.env.ADMIN_TOKEN = token;
    const { response, nextCalled } = callAdminMiddleware(token);
    assert.equal(response.statusCode, null);
    assert.equal(nextCalled, true);
    restoreEnv('ADMIN_TOKEN', originalToken);
});

test('production CORS rejects unlisted browser origins', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    const previousOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;
    const corsOptions = createCorsOptions();
    const allowed = await new Promise((resolve) => corsOptions.origin('https://attacker.example', (error, result) => resolve(result)));
    assert.equal(allowed, false);
    restoreEnv('NODE_ENV', previousEnvironment);
    restoreEnv('ALLOWED_ORIGINS', previousOrigins);
});
