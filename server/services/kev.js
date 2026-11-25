const axios = require('axios');

const CISA_KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CISA_KEV_MIRROR = 'https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json';
const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_TTL_MS = 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 60 * 1000;

function normalizeKev(payload) {
    if (!Array.isArray(payload?.vulnerabilities) || payload.vulnerabilities.length === 0) {
        throw new Error('Invalid KEV catalog');
    }

    const unique = new Map();
    for (const vuln of payload.vulnerabilities) {
        if (!CVE_PATTERN.test(vuln?.cveID || '') || !DATE_PATTERN.test(vuln?.dateAdded || '')) {
            continue;
        }
        const readText = (key) => (typeof vuln[key] === 'string' ? vuln[key].slice(0, 4000) : '');
        unique.set(vuln.cveID, {
            cve: vuln.cveID,
            vendor: readText('vendorProject'),
            product: readText('product'),
            name: readText('vulnerabilityName'),
            description: readText('shortDescription'),
            action: readText('requiredAction'),
            added: vuln.dateAdded,
            due: readText('dueDate'),
            ransomware: vuln.knownRansomwareCampaignUse === 'Known' ? 'Known' : 'Unknown'
        });
    }

    if (unique.size === 0) {
        throw new Error('Empty KEV catalog');
    }

    return {
        version: typeof payload.catalogVersion === 'string' ? payload.catalogVersion : '',
        released: payload.dateReleased || null,
        entries: [...unique.values()].sort(
            (a, b) => b.added.localeCompare(a.added) || a.cve.localeCompare(b.cve)
        )
    };
}

function createKevService(loadCatalog, now = Date.now) {
    let cache = null;
    let pending = null;
    let retryAt = 0;

    async function getCatalog() {
        if (cache && now() - cache.at < CACHE_TTL_MS) {
            return { ...cache.data, stale: false };
        }
        if (pending) {
            return pending;
        }
        if (now() < retryAt) {
            if (cache) {
                return { ...cache.data, stale: true };
            }
            throw new Error('KEV temporarily unavailable');
        }

        pending = (async () => {
            try {
                const data = normalizeKev(await loadCatalog());
                cache = {
                    at: now(),
                    data: { ...data, fetchedAt: new Date(now()).toISOString() },
                    cveSet: new Set(data.entries.map((entry) => entry.cve))
                };
                return { ...cache.data, stale: false };
            } catch (error) {
                retryAt = now() + RETRY_COOLDOWN_MS;
                if (cache) {
                    return { ...cache.data, stale: true };
                }
                throw error;
            } finally {
                pending = null;
            }
        })();

        return pending;
    }

    getCatalog.getCachedCveSet = () => (cache ? cache.cveSet : new Set());
    return getCatalog;
}

const getCatalog = createKevService(async () => {
    const options = {
        timeout: 12000,
        maxContentLength: 8 * 1024 * 1024,
        maxRedirects: 0,
        proxy: false
    };
    try {
        return (await axios.get(CISA_KEV_URL, options)).data;
    } catch {
        return (await axios.get(CISA_KEV_MIRROR, options)).data;
    }
});

module.exports = {
    getCatalog,
    normalizeKev,
    createKevService
};
