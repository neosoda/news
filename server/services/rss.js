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
const { translateText, categorizeArticle } = require('./ai');
const { computeArticleFingerprint, computeArticleDedupKey, computeLegacyArticleDedupKey } = require('./articleDedup');
const { validateOutboundHttpUrl } = require('./urlSafety');

const FEED_TIMEOUT_MS = 10000;
const FEED_MAX_REDIRECTS = 5;
const MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;
const IMAGE_RECOVERY_TIMEOUT_MS = 5000;
const IMAGE_RECOVERY_MAX_BYTES = 1024 * 1024;
const ENABLE_IMAGE_RECOVERY_FETCH = process.env.ENABLE_IMAGE_RECOVERY_FETCH === 'true';
const MAX_SOURCE_ERROR_LENGTH = 400;

let activeUpdatePromise = null;

function readPositiveIntFromEnv(name, fallback) {
    const rawValue = process.env[name];
    const parsed = Number.parseInt(rawValue || '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const SOURCE_FAILURE_COOLDOWN_MINUTES = readPositiveIntFromEnv('SOURCE_FAILURE_COOLDOWN_MINUTES', 60);
const SOURCE_DISABLE_AFTER_CONSECUTIVE_FAILURES = readPositiveIntFromEnv('SOURCE_DISABLE_AFTER_CONSECUTIVE_FAILURES', 12);

function normalizeErrorMessage(errorMessage) {
    if (typeof errorMessage !== 'string' || !errorMessage.trim()) {
        return 'unknown_error';
    }
    return errorMessage.trim().slice(0, MAX_SOURCE_ERROR_LENGTH);
}

function isSourceInCooldown(source, now = new Date()) {
    if (!source?.cooldownUntil) {
        return false;
    }

    const cooldownUntil = new Date(source.cooldownUntil);
    if (Number.isNaN(cooldownUntil.getTime())) {
        return false;
    }

    return cooldownUntil > now;
}

async function markSourceFailure(source, reason) {
    if (!source?.id) {
        return;
    }

    const failureDate = new Date();
    const currentFailures = Number.isInteger(source.consecutiveFailures) ? source.consecutiveFailures : 0;
    const nextFailures = currentFailures + 1;
    const shouldDeactivate = nextFailures >= SOURCE_DISABLE_AFTER_CONSECUTIVE_FAILURES;
    const cooldownUntil = shouldDeactivate
        ? null
        : new Date(failureDate.getTime() + SOURCE_FAILURE_COOLDOWN_MINUTES * 60 * 1000);

    try {
        await prisma.source.update({
            where: { id: source.id },
            data: {
                consecutiveFailures: nextFailures,
                lastFailureAt: failureDate,
                lastError: normalizeErrorMessage(reason),
                cooldownUntil,
                isActive: !shouldDeactivate
            }
        });
    } catch (updateError) {
        console.error(`[RSS] Failed to persist source failure state source="${source.name}" reason="${updateError.message}"`);
        return;
    }

    if (shouldDeactivate) {
        console.error(
            `[RSS] Source disabled after consecutive failures source="${source.name}" failures=${nextFailures} reason="${normalizeErrorMessage(reason)}"`
        );
    } else {
        console.warn(
            `[RSS] Source cooldown applied source="${source.name}" failures=${nextFailures} cooldownUntil="${cooldownUntil.toISOString()}" reason="${normalizeErrorMessage(reason)}"`
        );
    }
}

async function markSourceSuccess(source) {
    if (!source?.id) {
        return;
    }

    try {
        await prisma.source.update({
            where: { id: source.id },
            data: {
                lastFetched: new Date(),
                consecutiveFailures: 0,
                lastFailureAt: null,
                lastError: null,
                cooldownUntil: null,
                isActive: true
            }
        });
    } catch (updateError) {
        console.error(`[RSS] Failed to persist source success state source="${source.name}" reason="${updateError.message}"`);
    }
}

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

function sanitizeArticleDate(articleDate) {
    const now = Date.now();
    const parsedDate = articleDate instanceof Date ? articleDate : new Date(articleDate);

    if (Number.isNaN(parsedDate.getTime())) {
        return new Date(now);
    }

    const maxAllowedDate = now + MAX_FUTURE_SKEW_MS;
    if (parsedDate.getTime() > maxAllowedDate) {
        return new Date(now);
    }

    return parsedDate;
}


async function clampFutureArticleDates() {
    const now = new Date();
    const maxAllowedDate = new Date(now.getTime() + MAX_FUTURE_SKEW_MS);

    try {
        const updated = await prisma.article.updateMany({
            where: {
                date: { gt: maxAllowedDate }
            },
            data: { date: now }
        });

        if (updated.count > 0) {
            console.log(`Date cleanup complete. Normalized ${updated.count} future-dated articles.`);
        }
    } catch (error) {
        console.error('Error during future-date cleanup:', error);
    }
}

async function fetchFeedXml(source) {
    const startedAt = Date.now();
    let response;

    const sourceUrlValidation = await validateOutboundHttpUrl(source.url, {
        allowPrivateNetwork: false,
        resolveDns: true
    });
    if (!sourceUrlValidation.ok) {
        return {
            ok: false,
            error: `source_url_blocked:${sourceUrlValidation.reason}`,
            durationMs: Date.now() - startedAt
        };
    }

    try {
        response = await axios.get(sourceUrlValidation.normalizedUrl, {
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


function normalizeUrl(url) {
    try {
        const parsed = new URL(url);

        parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        parsed.hash = '';

        if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }

        const paramsToRemove = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid',
            '_ga', 'igshid', 'yclid', 'output', 'spm', 'wt_mc', 'cmpid'
        ];
        paramsToRemove.forEach(param => parsed.searchParams.delete(param));

        parsed.searchParams.sort();
        return parsed.toString();
    } catch (e) {
        return url;
    }
}

async function fetchAndProcessFeed(source) {
    const sourceLabel = `source="${source.name}" url="${source.url}"`;
    console.log(`[RSS] Fetch start ${sourceLabel}`);

    const failAndExit = async (reason) => {
        await markSourceFailure(source, reason);
        return 0;
    };

    try {
        if (!source.url) {
            console.error(`[RSS] Fetch failed ${sourceLabel} reason="missing_url"`);
            return await failAndExit('missing_url');
        }

        const fetchResult = await fetchFeedXml(source);
        if (!fetchResult.ok) {
            console.error(
                `[RSS] Fetch failed ${sourceLabel} reason="${fetchResult.error}" status=${fetchResult.status || 'n/a'} durationMs=${fetchResult.durationMs} finalUrl="${fetchResult.finalUrl || 'n/a'}"`
            );
            return await failAndExit(fetchResult.error || 'feed_fetch_failed');
        }

        console.log(
            `[RSS] Fetch success ${sourceLabel} status=${fetchResult.status} durationMs=${fetchResult.durationMs} finalUrl="${fetchResult.finalUrl}" contentType="${fetchResult.contentType || 'unknown'}"`
        );

        let feed;
        try {
            feed = await parser.parseString(fetchResult.body);
        } catch (parseError) {
            console.error(`[RSS] Parse failed ${sourceLabel} reason="${parseError.message}"`);
            return await failAndExit(`parse_failed:${parseError.message}`);
        }

        if (!feed || !Array.isArray(feed.items)) {
            console.error(`[RSS] Parse failed ${sourceLabel} reason="invalid_feed_structure"`);
            return await failAndExit('invalid_feed_structure');
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
            const articleDate = sanitizeArticleDate(getItemDate(item) || new Date());
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

            const legacyArticleDedupKey = computeLegacyArticleDedupKey({
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

            if (legacyArticleDedupKey && legacyArticleDedupKey !== articleDedupKey) {
                duplicateCriteria.push({ dedupKey: legacyArticleDedupKey });
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
                if (!image && item.link && ENABLE_IMAGE_RECOVERY_FETCH) {
                    const linkValidation = await validateOutboundHttpUrl(item.link, {
                        allowPrivateNetwork: false,
                        resolveDns: false
                    });
                    if (!linkValidation.ok) {
                        imageRecoveryFailures++;
                    } else {
                        try {
                            const response = await axios.get(linkValidation.normalizedUrl, {
                                timeout: IMAGE_RECOVERY_TIMEOUT_MS,
                                maxContentLength: IMAGE_RECOVERY_MAX_BYTES,
                                maxBodyLength: IMAGE_RECOVERY_MAX_BYTES,
                                responseType: 'text',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (compatible; NewsAI/1.0; +https://localhost)',
                                    'Accept': 'text/html,application/xhtml+xml'
                                }
                            });
                            const $ = cheerio.load(response.data);
                            image = $('meta[property="og:image"]').attr('content') ||
                                $('meta[name="twitter:image"]').attr('content');
                        } catch (e) {
                            imageRecoveryFailures++;
                        }
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
                            title: titleFr,          // Titre traduit en français
                            originalTitle: item.title || null, // Titre original (base stable pour le fingerprint)
                            link: normalizedLink,    // URL normalisée
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

        await markSourceSuccess(source);

        console.log(
            `[RSS] Summary ${sourceLabel} items=${feed.items.length} recent=${recentItems} added=${newArticlesCount} skippedOld=${skippedOld} skippedExisting=${skippedExisting} skippedSpam=${skippedSpam} skippedMissingLink=${skippedMissingLink} createErrors=${createErrors} itemErrors=${processingErrors} imageRecoveryFailures=${imageRecoveryFailures}`
        );

        return newArticlesCount;

    } catch (error) {
        console.error(`[RSS] Fetch failed ${sourceLabel} reason="${error.message}"`);
        return await failAndExit(error.message || 'unexpected_feed_failure');
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
    if (activeUpdatePromise) {
        console.log('[RSS] Update already running, joining active execution.');
        return activeUpdatePromise;
    }

    activeUpdatePromise = (async () => {
        console.log('Starting RSS feed update...');

        // Run cleanup before update
        await cleanupOldArticles();
        await clampFutureArticleDates();

        const sources = await prisma.source.findMany();
        let totalNew = 0;
        let skippedInactive = 0;
        let skippedCooldown = 0;
        const now = new Date();

        for (const source of sources) {
            if (!source.isActive) {
                skippedInactive++;
                continue;
            }

            if (isSourceInCooldown(source, now)) {
                skippedCooldown++;
                continue;
            }

            totalNew += await fetchAndProcessFeed(source);
        }

        console.log(
            `RSS Update complete. ${totalNew} new articles added. skippedInactive=${skippedInactive} skippedCooldown=${skippedCooldown}`
        );
        return totalNew;
    })();

    try {
        return await activeUpdatePromise;
    } finally {
        activeUpdatePromise = null;
    }
}

module.exports = { updateAllFeeds, fetchAndProcessFeed, cleanupOldArticles };
