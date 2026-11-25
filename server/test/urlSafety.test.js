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

test('rejects mapped IPv4, non-global IPv6, Teredo, trailing-dot local hosts, and URL credentials', async () => {
    for (const url of [
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:a00:1]/',
        'http://[ff02::1]/',
        'http://[2002:a00:1::1]/',
        'http://[2001:0000::1]/',
        'http://[2001::1]/',
        'http://[2001:2::1]/',
        'http://[2001:10::1]/',
        'http://[2001:20::1]/',
        'http://[2001:db8::1]/',
        'http://localhost./',
        'http://internal.local./',
        'https://user:pass@example.com/'
    ]) {
        assert.equal((await validateOutboundHttpUrl(url, { resolveDns: false })).ok, false, url);
    }
    assert.equal((await validateOutboundHttpUrl('https://[2606:4700::1111]/')).ok, true);
});
test('pinned lookup supports Node autoSelectFamily', () => {
    const lookup = require('../services/urlSafety').createPinnedLookup(['8.8.8.8']);
    lookup('example.com', { all: true }, (error, addresses) => {
        assert.ifError(error);
        assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
    });
});

test('reader links accept only HTTP(S) and resolve relative feed links',()=>{
    const {normalizePublicLink}=require('../services/urlSafety');
    assert.equal(normalizePublicLink('/article','https://example.com/feed'),'https://example.com/article');
    assert.equal(normalizePublicLink('javascript:alert(1)','https://example.com'),null);
    assert.equal(normalizePublicLink('https://user:pass@example.com'),null);
});
