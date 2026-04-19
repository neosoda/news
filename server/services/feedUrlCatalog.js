function normalizeSourceUrlForLookup(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return '';
    }

    try {
        const parsed = new URL(rawUrl.trim());
        const protocol = parsed.protocol.toLowerCase();
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const pathname = parsed.pathname !== '/' && parsed.pathname.endsWith('/')
            ? parsed.pathname.slice(0, -1)
            : parsed.pathname;
        const search = parsed.search || '';

        return `${protocol}//${hostname}${pathname}${search}`;
    } catch {
        return rawUrl.trim().toLowerCase();
    }
}

function buildNormalizedMap(entries) {
    const map = new Map();
    for (const [rawUrl, value] of entries) {
        map.set(normalizeSourceUrlForLookup(rawUrl), value);
    }
    return map;
}

const FEED_URL_REWRITE_ENTRIES = [
    ['https://www.cert.ssi.gouv.fr/feed/alertes/', 'https://cert.ssi.gouv.fr/alerte/feed/'],
    ['https://www.cert.ssi.gouv.fr/feed/avis/', 'https://cert.ssi.gouv.fr/avis/feed/'],
    ['https://www.cybermalveillance.gouv.fr/feed', 'https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites'],
    ['https://www.lemondeinformatique.fr/flux-rss/thematique/securite/flux.xml', 'https://www.lemondeinformatique.fr/flux-rss/thematique/securite/rss.xml'],
    ['https://www.securityweek.com/rss', 'https://www.securityweek.com/feed/'],
    ['https://www.eset.com/fr/rss/', 'http://feeds.feedburner.com/eset/blog?format=xml']
];

const UNSUPPORTED_FEED_URL_ENTRIES = [
    ['https://cyber.gouv.fr/rss.xml', 'no_rss_endpoint_published']
];

const REWRITE_MAP = buildNormalizedMap(FEED_URL_REWRITE_ENTRIES);
const UNSUPPORTED_MAP = buildNormalizedMap(UNSUPPORTED_FEED_URL_ENTRIES);

function getCanonicalFeedUrl(rawUrl) {
    const key = normalizeSourceUrlForLookup(rawUrl);
    return REWRITE_MAP.get(key) || null;
}

function getUnsupportedFeedReason(rawUrl) {
    const key = normalizeSourceUrlForLookup(rawUrl);
    return UNSUPPORTED_MAP.get(key) || null;
}

module.exports = {
    normalizeSourceUrlForLookup,
    getCanonicalFeedUrl,
    getUnsupportedFeedReason
};
