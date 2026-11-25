const dns = require('dns').promises;
const net = require('net');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const DNS_LOOKUP_TIMEOUT_MS = 3000;

function isPrivateIPv4(address) {
    const parts = address.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
        return true;
    }

    const [a, b] = parts;

    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 2) ||
        (a === 198 && (b === 18 || b === 19 || b === 51)) ||
        (a === 203 && b === 0) ||
        a >= 224
    );
}

function expandIPv6Groups(address) {
    const clean = address.toLowerCase().split('%')[0];
    if (clean.includes('.')) {
        // IPv4-embedded IPv6 (e.g. ::ffff:127.0.0.1) is always non-global for SSRF purposes
        return null;
    }
    const halves = clean.split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = halves.length === 2 ? 8 - (left.length + right.length) : 0;
    if (missing < 0 || (halves.length === 1 && left.length !== 8)) return null;
    const groups = [...left, ...Array(missing).fill('0'), ...right];
    if (groups.length !== 8) return null;
    const parsed = groups.map((part) => (/^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : Number.NaN));
    return parsed.every(Number.isFinite) ? parsed : null;
}

function isPrivateIPv6(address) {
    const groups = expandIPv6Groups(address);
    if (!groups) return true;
    const [g0, g1] = groups;
    // Allow only Global Unicast (2000::/3) minus RFC 6890 special/transition ranges:
    // Teredo (2001:0000::/32), Benchmarking (2001:0002::/48), ORCHID (2001:0010::/28, 2001:0020::/28),
    // Documentation (2001:0db8::/32), 6to4 (2002::/16).
    if (g0 < 0x2000 || g0 > 0x3fff) return true;
    if (g0 === 0x2002) return true;
    if (g0 === 0x2001) {
        if (g1 === 0x0000 || g1 === 0x0002 || g1 === 0x0db8) return true;
        if ((g1 & 0xfff0) === 0x0010 || (g1 & 0xfff0) === 0x0020) return true;
    }
    return false;
}

function isPrivateOrLoopbackAddress(address) {
    const ipType = net.isIP(address);
    if (ipType === 4) {
        return isPrivateIPv4(address);
    }
    if (ipType === 6) {
        return isPrivateIPv6(address);
    }
    return false;
}

function isBlockedHostname(hostname) {
    if (!hostname) return true;
    const lowered = hostname.toLowerCase().replace(/\.+$/, '');
    if (!lowered) return true;

    return (
        lowered === 'localhost' ||
        lowered.endsWith('.localhost') ||
        lowered.endsWith('.local') ||
        lowered.endsWith('.internal')
    );
}

async function lookupHostAddresses(hostname) {
    const lookupPromise = dns.lookup(hostname, { all: true, verbatim: true });
    let timer;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('dns_timeout')), DNS_LOOKUP_TIMEOUT_MS);
        });
        const entries = await Promise.race([lookupPromise, timeoutPromise]);
        return entries.map((entry) => entry.address).filter(Boolean);
    } finally {
        clearTimeout(timer);
    }
}

async function validateOutboundHttpUrl(rawUrl, options = {}) {
    const { allowPrivateNetwork = false, resolveDns = true } = options;
    const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';

    if (!value) {
        return { ok: false, reason: 'url_missing' };
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return { ok: false, reason: 'url_invalid' };
    }

    if (parsed.username || parsed.password) return { ok: false, reason: 'credentials_not_allowed' };
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        return { ok: false, reason: 'protocol_not_allowed' };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isBlockedHostname(hostname)) {
        return { ok: false, reason: 'hostname_blocked' };
    }

    if (net.isIP(hostname)) {
        if (!allowPrivateNetwork && isPrivateOrLoopbackAddress(hostname)) {
            return { ok: false, reason: 'private_address_blocked' };
        }
        return { ok: true, normalizedUrl: parsed.toString(), hostname, addresses: [hostname] };
    }

    if (!allowPrivateNetwork && resolveDns) {
        try {
            const addresses = await lookupHostAddresses(hostname);
            if (addresses.length === 0) {
                return { ok: false, reason: 'dns_no_results' };
            }

            if (addresses.some((address) => isPrivateOrLoopbackAddress(address))) {
                return { ok: false, reason: 'private_resolution_blocked' };
            }
            return { ok: true, normalizedUrl: parsed.toString(), hostname, addresses };
        } catch {
            return { ok: false, reason: 'dns_lookup_failed' };
        }
    }

    return { ok: true, normalizedUrl: parsed.toString(), hostname, addresses: [] };
}

function createPinnedLookup(addresses = []) {
    const address = addresses[0];
    if (!address) return undefined;
    const family = net.isIP(address);
    return (hostname, options, callback) => {
        if (typeof options === 'function') { callback = options; options = {}; }
        if (options?.all) return callback(null, [{ address, family }]);
        return callback(null, address, family);
    };
}

function normalizePublicLink(raw, base) {
    try {
        const url = new URL(raw, base);
        return ALLOWED_PROTOCOLS.has(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}

module.exports = {
    normalizePublicLink,
    validateOutboundHttpUrl,
    createPinnedLookup
};
