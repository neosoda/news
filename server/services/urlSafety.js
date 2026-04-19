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
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

function isPrivateIPv6(address) {
    const normalized = address.toLowerCase();
    return (
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    );
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
    const lowered = hostname.toLowerCase();

    return (
        lowered === 'localhost' ||
        lowered.endsWith('.localhost') ||
        lowered.endsWith('.local') ||
        lowered.endsWith('.internal')
    );
}

async function lookupHostAddresses(hostname) {
    const lookupPromise = dns.lookup(hostname, { all: true, verbatim: true });
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('dns_timeout')), DNS_LOOKUP_TIMEOUT_MS);
    });

    const entries = await Promise.race([lookupPromise, timeoutPromise]);
    return entries.map((entry) => entry.address).filter(Boolean);
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

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        return { ok: false, reason: 'protocol_not_allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (isBlockedHostname(hostname)) {
        return { ok: false, reason: 'hostname_blocked' };
    }

    if (net.isIP(hostname)) {
        if (!allowPrivateNetwork && isPrivateOrLoopbackAddress(hostname)) {
            return { ok: false, reason: 'private_address_blocked' };
        }
        return { ok: true, normalizedUrl: parsed.toString(), hostname };
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
        } catch {
            return { ok: false, reason: 'dns_lookup_failed' };
        }
    }

    return { ok: true, normalizedUrl: parsed.toString(), hostname };
}

module.exports = {
    validateOutboundHttpUrl
};
