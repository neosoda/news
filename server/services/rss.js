const Parser = require('rss-parser');
const prisma = require('../db');
const parser = new Parser();
const cheerio = require('cheerio');
const { translateText } = require('./ai');

async function fetchAndProcessFeed(source) {
    try {
        const feed = await parser.parseURL(source.url);
        console.log(`Fetched ${feed.items.length} items from ${source.name}`);

        let newArticlesCount = 0;

        for (const item of feed.items) {
            // Simple deduplication by link
            const existing = await prisma.article.findUnique({
                where: { link: item.link }
            });

            if (!existing) {
                // Add a small delay to avoid hitting Mistral AI rate limits too fast
                await new Promise(resolve => setTimeout(resolve, 200));

                let image = null;
                // 1. Try standard RSS enclosure/media
                if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) {
                    image = item.enclosure.url;
                } else if (item['media:content'] && item['media:content'].url) {
                    image = item['media:content'].url;
                }

                // 2. Try parsing content with Cheerio if no image found
                if (!image && (item.content || item.contentSnippet)) {
                    const $ = cheerio.load(item.content || item.contentSnippet);
                    const firstImg = $('img').first().attr('src');
                    if (firstImg) image = firstImg;
                }

                // Translate Title and Content (Snippet)
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

        // Update last fetched time
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
