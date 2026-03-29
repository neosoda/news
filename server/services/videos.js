const Parser = require('rss-parser');

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsAI/1.0; +https://localhost)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*'
    },
    timeout: 10000
});

const VIDEO_CHANNELS = [
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
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
            const feed = await parser.parseURL(url);

            return (feed.items || []).map((item) => mapFeedItem(item, channel.name));
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
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
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
