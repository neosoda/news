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
const { getCanonicalFeedUrl, getUnsupportedFeedReason } = require('./feedUrlCatalog');

const FEED_TIMEOUT_MS = 10000;
const FEED_MAX_REDIRECTS = 5;
const MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;
const IMAGE_RECOVERY_TIMEOUT_MS = 5000;
const IMAGE_RECOVERY_MAX_BYTES = 1024 * 1024;
const ENABLE_IMAGE_RECOVERY_FETCH = process.env.ENABLE_IMAGE_RECOVERY_FETCH !== 'false';
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

function buildSourceFaviconUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return null;
    }

    try {
        const parsed = new URL(rawUrl.trim());
        return `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
    } catch {
        return null;
    }
}

function parseSrcSetFirstCandidate(srcSet) {
    if (typeof srcSet !== 'string' || !srcSet.trim()) {
        return null;
    }

    const firstChunk = srcSet.split(',')[0]?.trim();
    if (!firstChunk) {
        return null;
    }

    return firstChunk.split(/\s+/)[0] || null;
}

function looksLikeImageUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return false;
    }

    const withoutQuery = rawUrl.split('#')[0].split('?')[0].toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|ico)$/.test(withoutQuery);
}

function normalizeImageUrl(rawUrl, baseUrl) {
    if (typeof rawUrl !== 'string') {
        return null;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('data:')) {
        return null;
    }

    const protocolReady = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;

    try {
        const parsed = baseUrl ? new URL(protocolReady, baseUrl) : new URL(protocolReady);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

function extractImageFromHtmlFragment(html, baseUrl) {
    if (typeof html !== 'string' || !html.trim()) {
        return null;
    }

    try {
        const $ = cheerio.load(html);
        const firstImage = $('img').first();
        const directSrc = firstImage.attr('src');
        const lazySrc = firstImage.attr('data-src') || firstImage.attr('data-original');
        const srcSetCandidate = parseSrcSetFirstCandidate(firstImage.attr('srcset'));
        const rawImage = directSrc || lazySrc || srcSetCandidate;
        return normalizeImageUrl(rawImage, baseUrl);
    } catch {
        return null;
    }
}

function collectObjectImageCandidates(value) {
    if (!value) {
        return [];
    }

    if (typeof value === 'string') {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectObjectImageCandidates(entry));
    }

    if (typeof value === 'object') {
        const candidates = [];
        if (typeof value.url === 'string') {
            candidates.push(value.url);
        }
        if (typeof value.href === 'string') {
            candidates.push(value.href);
        }
        if (typeof value.src === 'string') {
            candidates.push(value.src);
        }
        return candidates;
    }

    return [];
}

function extractImageFromFeedItem(item, baseUrl) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const prioritizedCandidates = [];
    const fallbackCandidates = [];

    if (item.enclosure?.url) {
        if (item.enclosure.type?.startsWith('image') || looksLikeImageUrl(item.enclosure.url)) {
            prioritizedCandidates.push(item.enclosure.url);
        } else {
            fallbackCandidates.push(item.enclosure.url);
        }
    }

    prioritizedCandidates.push(...collectObjectImageCandidates(item['media:content']));
    prioritizedCandidates.push(...collectObjectImageCandidates(item['media:thumbnail']));
    prioritizedCandidates.push(...collectObjectImageCandidates(item.image));
    prioritizedCandidates.push(...collectObjectImageCandidates(item.thumbnail));
    prioritizedCandidates.push(...collectObjectImageCandidates(item.itunes?.image));

    for (const candidate of prioritizedCandidates) {
        const normalized = normalizeImageUrl(candidate, baseUrl);
        if (normalized) {
            return normalized;
        }
    }

    const htmlImage = extractImageFromHtmlFragment(item['content:encoded'], baseUrl)
        || extractImageFromHtmlFragment(item.content, baseUrl)
        || extractImageFromHtmlFragment(item.contentSnippet, baseUrl)
        || extractImageFromHtmlFragment(item.summary, baseUrl);
    if (htmlImage) {
        return htmlImage;
    }

    for (const candidate of fallbackCandidates) {
        const normalized = normalizeImageUrl(candidate, baseUrl);
        if (normalized) {
            return normalized;
        }
    }

    return null;
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

async function applyKnownSourceCorrections() {
    const now = new Date();
    const sources = await prisma.source.findMany({
        select: {
            id: true,
            name: true,
            url: true,
            isActive: true,
            consecutiveFailures: true
        }
    });

    for (const source of sources) {
        const unsupportedReason = getUnsupportedFeedReason(source.url);
        if (unsupportedReason && source.isActive) {
            try {
                await prisma.source.update({
                    where: { id: source.id },
                    data: {
                        isActive: false,
                        consecutiveFailures: SOURCE_DISABLE_AFTER_CONSECUTIVE_FAILURES,
                        lastFailureAt: now,
                        lastError: `unsupported_feed_url:${unsupportedReason}`,
                        cooldownUntil: null
                    }
                });
                console.warn(
                    `[RSS] Source auto-disabled (unsupported URL) source="${source.name}" url="${source.url}" reason="${unsupportedReason}"`
                );
            } catch (error) {
                console.error(`[RSS] Failed to disable unsupported source source="${source.name}" reason="${error.message}"`);
            }
            continue;
        }

        const canonicalUrl = getCanonicalFeedUrl(source.url);
        if (!canonicalUrl || canonicalUrl === source.url) {
            continue;
        }

        try {
            await prisma.source.update({
                where: { id: source.id },
                data: {
                    url: canonicalUrl,
                    consecutiveFailures: 0,
                    lastFailureAt: null,
                    lastError: null,
                    cooldownUntil: null,
                    isActive: true
                }
            });
            console.info(`[RSS] Source URL auto-corrected source="${source.name}" from="${source.url}" to="${canonicalUrl}"`);
        } catch (error) {
            if (error?.code === 'P2002') {
                try {
                    await prisma.source.update({
                        where: { id: source.id },
                        data: {
                            isActive: false,
                            lastFailureAt: now,
                            lastError: 'duplicate_canonical_source_url',
                            cooldownUntil: null
                        }
                    });
                } catch (secondaryError) {
                    console.error(
                        `[RSS] Failed to handle duplicate canonical source source="${source.name}" reason="${secondaryError.message}"`
                    );
                }
                continue;
            }

            console.error(
                `[RSS] Failed to apply source URL correction source="${source.name}" from="${source.url}" to="${canonicalUrl}" reason="${error.message}"`
            );
        }
    }
}

async function backfillMissingArticleImagesFromSources() {
    let totalBackfilled = 0;

    const sources = await prisma.source.findMany({
        select: {
            id: true,
            url: true,
            image: true
        }
    });

    for (const source of sources) {
        const fallbackImage = normalizeImageUrl(source.image || buildSourceFaviconUrl(source.url), source.url);
        if (!fallbackImage) {
            continue;
        }

        if (source.image !== fallbackImage) {
            try {
                await prisma.source.update({
                    where: { id: source.id },
                    data: { image: fallbackImage }
                });
            } catch (error) {
                console.error(`[RSS] Failed to set fallback source image sourceId=${source.id} reason="${error.message}"`);
            }
        }

        const updated = await prisma.article.updateMany({
            where: {
                sourceId: source.id,
                OR: [
                    { image: null },
                    { image: '' }
                ]
            },
            data: {
                image: fallbackImage
            }
        });

        totalBackfilled += updated.count;
    }

    if (totalBackfilled > 0) {
        console.log(`[RSS] Backfilled images for ${totalBackfilled} existing articles.`);
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
    const resolvedSourceUrl = getCanonicalFeedUrl(source.url) || source.url;
    const effectiveSource = resolvedSourceUrl === source.url ? source : { ...source, url: resolvedSourceUrl };
    const sourceLabel = `source="${source.name}" url="${effectiveSource.url}"`;
    console.log(`[RSS] Fetch start ${sourceLabel}`);

    const failAndExit = async (reason) => {
        await markSourceFailure(effectiveSource, reason);
        return 0;
    };

    try {
        if (!effectiveSource.url) {
            console.error(`[RSS] Fetch failed ${sourceLabel} reason="missing_url"`);
            return await failAndExit('missing_url');
        }

        const fetchResult = await fetchFeedXml(effectiveSource);
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

        // Ensure every source has a fallback image (logo or favicon)
        let sourceFallbackImage = normalizeImageUrl(
            effectiveSource.image || feed.image?.url || buildSourceFaviconUrl(effectiveSource.url),
            effectiveSource.url
        );
        if (sourceFallbackImage && sourceFallbackImage !== effectiveSource.image) {
            await prisma.source.update({
                where: { id: effectiveSource.id },
                data: { image: sourceFallbackImage }
            });
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
                let image = extractImageFromFeedItem(item, item.link || effectiveSource.url);

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
                            const metaImage = $('meta[property="og:image"]').attr('content') ||
                                $('meta[name="twitter:image"]').attr('content');
                            image = normalizeImageUrl(metaImage, linkValidation.normalizedUrl) ||
                                extractImageFromHtmlFragment(response.data, linkValidation.normalizedUrl);
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
                    const finalImage = normalizeImageUrl(image, item.link || effectiveSource.url) || sourceFallbackImage;
                    await prisma.article.create({
                        data: {
                            title: titleFr,          // Titre traduit en français
                            originalTitle: item.title || null, // Titre original (base stable pour le fingerprint)
                            link: normalizedLink,    // URL normalisée
                            fingerprint: articleFingerprint,
                            dedupKey: articleDedupKey,
                            date: articleDate,
                            content: contentFr,
                            sourceId: effectiveSource.id,
                            image: finalImage,
                            category: category || effectiveSource.category
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

        await markSourceSuccess(effectiveSource);

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
        await applyKnownSourceCorrections();
        await backfillMissingArticleImagesFromSources();

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

module.exports = {
    updateAllFeeds,
    fetchAndProcessFeed,
    cleanupOldArticles,
    applyKnownSourceCorrections,
    backfillMissingArticleImagesFromSources
};
