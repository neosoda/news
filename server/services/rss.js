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
            const articleDate = item.pubDate ? new Date(item.pubDate) : new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Fetch only items from the last 7 days
            if (articleDate < sevenDaysAgo) continue;

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
                        const response = await axios.get(item.link, { timeout: 5000 });
                        const $ = cheerio.load(response.data);
                        image = $('meta[property="og:image"]').attr('content') ||
                            $('meta[name="twitter:image"]').attr('content');
                    } catch (e) {
                        // console.error(`Deep image recovery failed for ${item.link}:`, e.message);
                    }
                }

                const titleFr = await translateText(item.title);
                const contentFr = await translateText(item.contentSnippet || item.content || '');
                const category = await categorizeArticle(titleFr, contentFr);

                if (category === 'Spam') {
                    console.log(`❌ Article ignoré (Putaclic/Pub): ${titleFr}`);
                    continue;
                }

                try {
                    await prisma.article.create({
                        data: {
                            title: titleFr,
                            link: item.link,
                            date: item.pubDate ? new Date(item.pubDate) : new Date(),
                            content: contentFr,
                            sourceId: source.id,
                            image: image,
                            category: category || source.category
                        }
                    });
                    newArticlesCount++;
                } catch (createError) {
                    if (createError.code === 'P2002') {
                        // Article already exists, skip it
                        // console.log(`Article already exists (duplicate link): ${item.link}`);
                    } else {
                        console.error(`Error creating article:`, createError);
                    }
                }
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
