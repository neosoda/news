const Parser = require('rss-parser');

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsAI/1.0; +https://localhost)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*'
    },
    timeout: 10000
});

const VIDEO_CHANNELS = [
    { id: 'UCWeg2Pkate69NFdBeuRFTAw', name: 'Underscore_', topics: ['ia', 'ai', 'it', 'tech', 'dev'], language: 'fr' },
    { id: 'UCiwOcD5f4J1A6fR_M2ZeAww', name: 'Grafikart', topics: ['it', 'dev', 'tech'], language: 'fr' },
    { id: 'UCsE40xYfrf0ACXQHpv4C9rw', name: 'Machine Learnia', topics: ['ia', 'ai', 'ml'], language: 'fr' },
    { id: 'UCSf0s2l1taSGxR6fVvYho6Q', name: 'Micode', topics: ['it', 'dev', 'tech'], language: 'fr' },
    { handle: 'ParlonsCyber', name: 'ParlonsCyber', topics: ['ia', 'ai', 'it', 'tech', 'cyber'], language: 'fr' },
    { handle: 'Fransosiche', name: 'Fransosiche', topics: ['ia', 'ai', 'it', 'tech'], language: 'fr' },
    { handle: 'IT-Connect', name: 'IT-Connect', topics: ['it', 'tech', 'cyber', 'dev'], language: 'fr' },
    { handle: 'Shubham_Sharma', name: 'Shubham Sharma', topics: ['ia', 'ai', 'it', 'tech', 'dev'] },
    { handle: 'FEU', name: 'FEU', topics: ['ia', 'ai', 'it', 'tech'], language: 'fr' },
    { handle: 'LouisGraffeuil', name: 'Louis Graffeuil', topics: ['ia', 'ai', 'tech'], language: 'fr' },
    { handle: 'elliottpierret', name: 'Elliott Pierret', topics: ['ia', 'ai', 'it', 'tech'], language: 'fr' },
    { handle: 'HenriExplorIA', name: 'Henri ExplorIA', topics: ['ia', 'ai', 'llm'], language: 'fr' },
    { handle: 'LudovicSalenne', name: 'Ludovic Salenne', topics: ['ia', 'ai', 'it', 'tech'], language: 'fr' },
    { handle: 'yassine-sdiri', name: 'Yassine Sdiri', topics: ['ia', 'ai', 'it', 'tech'], language: 'fr' },
    { handle: 'Franck_Scandolera', name: 'Franck Scandolera', topics: ['ia', 'ai', 'it', 'tech', 'cyber'], language: 'fr' },
    { handle: 'DRFIRASS', name: 'DR FIRASS', topics: ['ia', 'ai', 'it', 'tech'], language: 'fr' },
    { handle: 'Cookieconnecté', name: 'Cookieconnecté', topics: ['ia', 'ai', 'it', 'tech', 'cyber'], language: 'fr' },
    { id: 'UCbfYPyITQ-7l4upoX8nvctg', name: 'Two Minute Papers', topics: ['ia', 'ai', 'ml'] },
    { id: 'UC0vBXGSyV14uvJ4hECDOl0Q', name: 'Hugging Face', topics: ['ia', 'ai', 'llm'] },
    { id: 'UCSHZKyawb77ixDdsGog4iWA', name: 'Lex Fridman', topics: ['ia', 'ai', 'tech'] },
    { id: 'UCW8Ews7tdKKkBT6GdtQaXvQ', name: 'freeCodeCamp.org', topics: ['it', 'dev', 'tech'] },
    { id: 'UCsBjURrPoezykLs9EqgamOA', name: 'Fireship', topics: ['it', 'dev', 'tech'] },
    { id: 'UCXuqSBlHAE6Xw-yeJA0Tunw', name: 'Linus Tech Tips', topics: ['tech', 'hardware', 'it'] }
];

const DEFAULT_TOPICS = ['ia', 'ai', 'it', 'tech'];
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 24;
const HANDLE_CHANNEL_ID_REGEX = /"channelId":"(UC[\w-]{20,})"/;
const HANDLE_EXTERNAL_ID_REGEX = /"externalId":"(UC[\w-]{20,})"/;
const handleResolutionCache = new Map();

function normalizeTopic(topic) {
    return topic
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function parseTopics(input) {
    if (!input || typeof input !== 'string') {
        return DEFAULT_TOPICS;
    }

    const topics = input
        .split(',')
        .map(normalizeTopic)
        .filter(Boolean);

    return topics.length > 0 ? topics : DEFAULT_TOPICS;
}

function parseLimit(rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return DEFAULT_LIMIT;
    }

    return Math.min(parsed, MAX_LIMIT);
}

function extractYoutubeVideoId(link = '') {
    const match = link.match(/[?&]v=([\w-]{6,})/);
    return match ? match[1] : null;
}

async function resolveChannelIdFromHandle(handle) {
    if (!handle) {
        return null;
    }

    if (handleResolutionCache.has(handle)) {
        return handleResolutionCache.get(handle);
    }

    const url = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; NewsAI/1.0; +https://localhost)',
                Accept: 'text/html,application/xhtml+xml'
            },
            signal: controller.signal
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        const channelMatch = html.match(HANDLE_CHANNEL_ID_REGEX) || html.match(HANDLE_EXTERNAL_ID_REGEX);
        const channelId = channelMatch?.[1] || null;
        handleResolutionCache.set(handle, channelId);
        return channelId;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function resolveFeedUrl(channel) {
    if (channel.id) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
    }

    const channelId = await resolveChannelIdFromHandle(channel.handle);
    if (!channelId) {
        throw new Error(`unable_to_resolve_channel_handle:${channel.handle}`);
    }

    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function shouldIncludeVideo(item, query, topics) {
    const haystack = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase();

    if (query && !haystack.includes(query)) {
        return false;
    }

    if (!topics.length) {
        return true;
    }

    return topics.some((topic) => haystack.includes(topic));
}

function mapFeedItem(item, channelName) {
    const videoId = extractYoutubeVideoId(item.link);
    const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

    return {
        id: item.id || item.guid || item.link,
        title: item.title || 'Sans titre',
        url: item.link,
        description: item.contentSnippet || '',
        channel: channelName,
        publishedAt: item.isoDate || item.pubDate || null,
        thumbnail
    };
}

function likelyFrenchText(text = '') {
    if (!text) {
        return false;
    }

    const normalized = normalizeTopic(text);

    if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) {
        return true;
    }

    const frenchMarkers = [
        'avec',
        'pour',
        'dans',
        'comment',
        'francais',
        'intelligence artificielle',
        'developpement',
        'tutoriel'
    ];

    return frenchMarkers.some((marker) => normalized.includes(marker));
}

function getFrenchPriorityScore(video, channel) {
    if (channel?.language === 'fr') {
        return 2;
    }

    const content = `${video.title || ''} ${video.description || ''}`;
    return likelyFrenchText(content) ? 1 : 0;
}

async function fetchVideos({ query = '', topics = DEFAULT_TOPICS, limit = DEFAULT_LIMIT }) {
    const normalizedQuery = normalizeTopic(query);
    const selectedChannels = VIDEO_CHANNELS.filter((channel) => {
        if (!topics.length) {
            return true;
        }

        return channel.topics.some((topic) => topics.includes(topic));
    });

    const settled = await Promise.allSettled(
        selectedChannels.map(async (channel) => {
            const feedUrl = await resolveFeedUrl(channel);
            const feed = await parser.parseURL(feedUrl);
            return (feed.items || []).map((item) => {
                const mapped = mapFeedItem(item, channel.name);
                return {
                    ...mapped,
                    frenchPriority: getFrenchPriorityScore(mapped, channel)
                };
            });
        })
    );

    const errors = [];
    const videos = [];

    for (const result of settled) {
        if (result.status === 'fulfilled') {
            videos.push(...result.value);
            continue;
        }

        errors.push(result.reason?.message || 'unknown_error');
    }

    const deduplicated = Array.from(
        new Map(videos.filter((video) => video.url).map((video) => [video.url, video])).values()
    );

    const filtered = deduplicated
        .filter((video) => shouldIncludeVideo(video, normalizedQuery, topics))
        .sort((a, b) => {
            if (b.frenchPriority !== a.frenchPriority) {
                return b.frenchPriority - a.frenchPriority;
            }

            return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
        })
        .map(({ frenchPriority, ...video }) => video)
        .slice(0, limit);

    return {
        data: filtered,
        meta: {
            total: filtered.length,
            topics,
            query: normalizedQuery,
            sources: selectedChannels.length,
            partialFailure: errors.length > 0,
            errors
        }
    };
}

module.exports = {
    parseTopics,
    parseLimit,
    fetchVideos
};
