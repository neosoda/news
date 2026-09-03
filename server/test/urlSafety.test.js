const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOutboundHttpUrl } = require('../services/urlSafety');

test('SSRF protection blocks local, private, and link-local IPv4 destinations', async () => {
    for (const url of ['http://127.0.0.1/feed.xml', 'http://10.0.0.1/feed.xml', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/feed.xml']) {
        const result = await validateOutboundHttpUrl(url);
        assert.equal(result.ok, false, url);
        assert.equal(result.reason, 'private_address_blocked');
    }
});

test('SSRF protection blocks loopback IPv6 destinations', async () => {
    const result = await validateOutboundHttpUrl('http://[::1]/feed.xml');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'private_address_blocked');
});
