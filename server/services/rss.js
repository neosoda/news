const Parser = require('rss-parser');
const prisma = require('../db');
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
});
const cheerio = require('cheerio');
const axios = require('axios');
const crypto = require('crypto');
const { translateText, categorizeArticle } = require('./ai');

const FEED_TIMEOUT_MS = 10000;
const FEED_MAX_REDIRECTS = 5;

function getResponseUrl(response, fallbackUrl) {
    return response?.request?.res?.responseUrl || fallbackUrl;
}

function getItemDate(item) {
    if (!item?.pubDate) {
        return null;
    }
    const parsed = new Date(item.pubDate);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}

async function fetchFeedXml(source) {
    const startedAt = Date.now();
    let response;

    try {
        response = await axios.get(source.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            timeout: FEED_TIMEOUT_MS,
            maxRedirects: FEED_MAX_REDIRECTS,
            responseType: 'text',
            validateStatus: () => true
        });
    } catch (error) {
        return {
            ok: false,
            error: `request_failed: ${error.message}`,
            durationMs: Date.now() - startedAt
        };
    }

    const durationMs = Date.now() - startedAt;
    const finalUrl = getResponseUrl(response, source.url);
    const status = response.status;

    if (status < 200 || status >= 300) {
        return {
            ok: false,
            error: `http_status_${status}`,
            status,
            statusText: response.statusText,
            durationMs,
            finalUrl
        };
    }

    const body = response.data;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
        return {
            ok: false,
            error: 'empty_body',
            status,
            durationMs,
            finalUrl
        };
    }

    return {
        ok: true,
        status,
        durationMs,
        finalUrl,
        contentType: response.headers?.['content-type'],
        body
    };
}

const { URL } = require('url');


function normalizeWhitespace(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.replace(/\s+/g, ' ').trim();
}

function computeArticleFingerprint({ title, contentSnippet, content }) {
    const normalizedTitle = normalizeWhitespace(title).toLowerCase();
    const normalizedSnippet = normalizeWhitespace(contentSnippet).toLowerCase();
    const normalizedContent = normalizeWhitespace(content).toLowerCase();

    const fingerprintSource = [normalizedTitle, normalizedSnippet || normalizedContent]
        .filter(Boolean)
        .join('|');

    if (!fingerprintSource) {
        return null;
    }

    return crypto.createHash('sha256').update(fingerprintSource).digest('hex');
}

function computeArticleDedupKey({ title, contentSnippet, content }) {
    const normalizedTitle = normalizeWhitespace(title).toLowerCase();
    const normalizedSnippet = normalizeWhitespace(contentSnippet).toLowerCase();
    const normalizedContent = normalizeWhitespace(content).toLowerCase();

    // Keep dedup conservative: title + snippet first, then fallback to compact content extract.
    const contentBasis = normalizedSnippet || normalizedContent.slice(0, 500);
    if (!normalizedTitle || !contentBasis) {
        return null;
    }

    return crypto.createHash('sha256').update(`${normalizedTitle}|${contentBasis}`).digest('hex');
}

function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        // Remove common tracking parameters
        const paramsToRemove = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'msclkid', 'ref', 'source'
        ];
        paramsToRemove.forEach(param => parsed.searchParams.delete(param));
        return parsed.toString();
    } catch (e) {
        return url;
    }
}

async function fetchAndProcessFeed(source) {
    const sourceLabel = `source="${source.name}" url="${source.url}"`;
    console.log(`[RSS] Fetch start ${sourceLabel}`);

    try {
        if (!source.url) {
            console.error(`[RSS] Fetch failed ${sourceLabel} reason="missing_url"`);
            return 0;
        }

        const fetchResult = await fetchFeedXml(source);
        if (!fetchResult.ok) {
            console.error(
                `[RSS] Fetch failed ${sourceLabel} reason="${fetchResult.error}" status=${fetchResult.status || 'n/a'} durationMs=${fetchResult.durationMs} finalUrl="${fetchResult.finalUrl || 'n/a'}"`
            );
            return 0;
        }

        console.log(
            `[RSS] Fetch success ${sourceLabel} status=${fetchResult.status} durationMs=${fetchResult.durationMs} finalUrl="${fetchResult.finalUrl}" contentType="${fetchResult.contentType || 'unknown'}"`
        );

        let feed;
        try {
            feed = await parser.parseString(fetchResult.body);
        } catch (parseError) {
            console.error(`[RSS] Parse failed ${sourceLabel} reason="${parseError.message}"`);
            return 0;
        }

        if (!feed || !Array.isArray(feed.items)) {
            console.error(`[RSS] Parse failed ${sourceLabel} reason="invalid_feed_structure"`);
            return 0;
        }

        console.log(`[RSS] Parsed ${feed.items.length} items ${sourceLabel}`);

        // Update source image/logo if not set
        if (!source.image) {
            let sourceImage = feed.image ? feed.image.url : null;
            if (!sourceImage) {
                // Try to get favicon from URL
                try {
                    const url = new URL(source.url);
                    sourceImage = `${url.protocol}//${url.hostname}/favicon.ico`;
                } catch (e) { }
            }
            if (sourceImage) {
                await prisma.source.update({
                    where: { id: source.id },
                    data: { image: sourceImage }
                });
            }
        }

        let newArticlesCount = 0;
        let skippedOld = 0;
        let skippedExisting = 0;
        let skippedSpam = 0;
        let createErrors = 0;
        let imageRecoveryFailures = 0;
        let processingErrors = 0;
        let recentItems = 0;
        let skippedMissingLink = 0;

        for (const item of feed.items) {
            const articleDate = getItemDate(item) || new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Fetch only items from the last 7 days
            if (articleDate < sevenDaysAgo) {
                skippedOld++;
                continue;
            }

            recentItems++;

            if (!item.link) {
                skippedMissingLink++;
                continue;
            }

            const normalizedLink = normalizeUrl(item.link);

            const articleFingerprint = computeArticleFingerprint({
                title: item.title,
                contentSnippet: item.contentSnippet,
                content: item.content
            });

            const articleDedupKey = computeArticleDedupKey({
                title: item.title,
                contentSnippet: item.contentSnippet,
                content: item.content
            });

            // Check for existing article by normalized/original link and by semantic key.
            const duplicateCriteria = [
                { link: normalizedLink },
                { link: item.link }
            ];

            if (articleFingerprint) {
                duplicateCriteria.push({ fingerprint: articleFingerprint });
            }

            if (articleDedupKey) {
                duplicateCriteria.push({ dedupKey: articleDedupKey });
            }

            const existing = await prisma.article.findFirst({
                where: {
                    OR: duplicateCriteria
                }
            });

            if (existing) {
                skippedExisting++;
                continue;
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            try {
                let image = null;
                // 1. Try standard RSS enclosure/media
                if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) {
                    image = item.enclosure.url;
                } else if (item['media:content'] && item['media:content'].url) {
                    image = item['media:content'].url;
                }

                // 2. Try parsing content snippet for <img>
                if (!image && (item.content || item.contentSnippet)) {
                    const $ = cheerio.load(item.content || item.contentSnippet);
                    const firstImg = $('img').first().attr('src');
                    if (firstImg) image = firstImg;
                }

                // 3. Deep recovery: Fetch page and look for og:image
                if (!image && item.link) {
                    try {
                        const response = await axios.get(item.link, { timeout: 5000 });
                        const $ = cheerio.load(response.data);
                        image = $('meta[property="og:image"]').attr('content') ||
                            $('meta[name="twitter:image"]').attr('content');
                    } catch (e) {
                        imageRecoveryFailures++;
                    }
                }

                const titleFr = await translateText(item.title);
                // Double check translated title to be sure (optional, but let's stick to original title for duplication check)

                const contentFr = await translateText(item.contentSnippet || item.content || '');
                const category = await categorizeArticle(titleFr, contentFr);

                if (category === 'Spam') {
                    skippedSpam++;
                    continue;
                }

                try {
                    await prisma.article.create({
                        data: {
                            title: titleFr, // We store the French title
                            link: normalizedLink, // Store normalized link
                            fingerprint: articleFingerprint,
                            dedupKey: articleDedupKey,
                            date: articleDate,
                            content: contentFr,
                            sourceId: source.id,
                            image: image,
                            category: category || source.category
                        }
                    });
                    newArticlesCount++;
                } catch (createError) {
                    if (createError.code === 'P2002') {
                        skippedExisting++;
                    } else {
                        createErrors++;
                        console.error(`[RSS] Article create failed ${sourceLabel} link="${normalizedLink}" reason="${createError.message}"`);
                    }
                }
            } catch (itemError) {
                processingErrors++;
                console.error(`[RSS] Item processing failed ${sourceLabel} link="${item.link}" reason="${itemError.message}"`);
            }
        }

        await prisma.source.update({
            where: { id: source.id },
            data: { lastFetched: new Date() }
        });

        console.log(
            `[RSS] Summary ${sourceLabel} items=${feed.items.length} recent=${recentItems} added=${newArticlesCount} skippedOld=${skippedOld} skippedExisting=${skippedExisting} skippedSpam=${skippedSpam} skippedMissingLink=${skippedMissingLink} createErrors=${createErrors} itemErrors=${processingErrors} imageRecoveryFailures=${imageRecoveryFailures}`
        );

        return newArticlesCount;

    } catch (error) {
        console.error(`[RSS] Fetch failed ${sourceLabel} reason="${error.message}"`);
        return 0;
    }
}

async function cleanupOldArticles() {
    console.log('Cleaning up articles older than 30 days...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
        const deleted = await prisma.article.deleteMany({
            where: {
                date: { lt: thirtyDaysAgo },
                isBookmarked: false // Protect bookmarked articles from cleanup
            }
        });
        console.log(`Cleanup complete. Deleted ${deleted.count} old articles.`);
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

async function updateAllFeeds() {
    console.log('Starting RSS feed update...');

    // Run cleanup before update
    await cleanupOldArticles();

    const sources = await prisma.source.findMany();
    let totalNew = 0;

    for (const source of sources) {
        totalNew += await fetchAndProcessFeed(source);
    }

    console.log(`RSS Update complete. ${totalNew} new articles added.`);
    return totalNew;
}

module.exports = { updateAllFeeds, fetchAndProcessFeed, cleanupOldArticles };
