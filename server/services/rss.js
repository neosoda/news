const Parser = require('rss-parser');
const prisma = require('../db');
const parser = new Parser();
const cheerio = require('cheerio');
const axios = require('axios');
const { translateText } = require('./ai');

async function fetchAndProcessFeed(source) {
    try {
        const feed = await parser.parseURL(source.url);
        console.log(`Fetched ${feed.items.length} items from ${source.name}`);

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

        for (const item of feed.items) {
            const existing = await prisma.article.findUnique({
                where: { link: item.link }
            });

            if (!existing) {
                await new Promise(resolve => setTimeout(resolve, 200));

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
                        const targetUrl = new URL(item.link);
                        // Prevent SSRF: Block local/internal IPs (basic check)
                        const isInternal = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(targetUrl.hostname);
                        if (isInternal || targetUrl.hostname === 'localhost') {
                            throw new Error('Blocked internal URL');
                        }

                        const response = await axios.get(item.link, {
                            timeout: 5000,
                            maxContentLength: 1024 * 1024 // 1MB limit for HTML
                        });
                        const $ = cheerio.load(response.data);
                        image = $('meta[property="og:image"]').attr('content') ||
                            $('meta[name="twitter:image"]').attr('content');
                    } catch (e) {
                        // console.error(`Deep image recovery failed for ${item.link}:`, e.message);
                    }
                }

                const titleFr = await translateText(item.title);
                const contentFr = await translateText(item.contentSnippet || item.content || '');

                await prisma.article.create({
                    data: {
                        title: titleFr,
                        link: item.link,
                        date: item.pubDate ? new Date(item.pubDate) : new Date(),
                        content: contentFr,
                        sourceId: source.id,
                        image: image
                    }
                });
                newArticlesCount++;
            }
        }

        await prisma.source.update({
            where: { id: source.id },
            data: { lastFetched: new Date() }
        });

        if (newArticlesCount > 0) {
            console.log(`Added ${newArticlesCount} new articles for ${source.name}`);
        }

        return newArticlesCount;

    } catch (error) {
        console.error(`Error fetching feed ${source.name} (${source.url}):`, error.message);
        return 0;
    }
}

async function updateAllFeeds() {
    console.log('Starting RSS feed update...');
    const sources = await prisma.source.findMany();
    let totalNew = 0;

    for (const source of sources) {
        totalNew += await fetchAndProcessFeed(source);
    }

    console.log(`RSS Update complete. ${totalNew} new articles added.`);
    return totalNew;
}

module.exports = { updateAllFeeds, fetchAndProcessFeed };
