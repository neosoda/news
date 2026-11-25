const { tokenizeTitleToSortedSet, jaccardTitleSimilarity } = require('./articleDedup');

const EDITORIAL_STOPWORDS = new Set([
    // French generic words
    'plus', 'cette', 'tout', 'tous', 'toute', 'toutes', 'faire', 'fait', 'etre',
    'annonce', 'article', 'actualite', 'nouveaux', 'nouveau', 'nouvelle', 'nouvelles',
    'peut', 'peuvent', 'sera', 'seront', 'sont', 'etait', 'contre', 'apres', 'avant',
    'entre', 'selon', 'comme', 'aussi', 'bien', 'tres', 'sans', 'avec', 'pour', 'dans',
    'ainsi', 'dont', 'leurs', 'notre', 'votre', 'vous', 'nous', 'elle', 'elles', 'vers',
    'chez', 'sous', 'comment', 'pourquoi', 'quand', 'quoi',
    // English generic words
    'about', 'after', 'before', 'being', 'between', 'could', 'from', 'have', 'into',
    'more', 'most', 'news', 'over', 'some', 'than', 'that', 'their', 'them', 'then',
    'there', 'these', 'they', 'this', 'under', 'what', 'when', 'where', 'which',
    'while', 'will', 'with', 'would', 'your'
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const CLUSTER_JACCARD_THRESHOLD = 0.55;

function extractKeywords(title) {
    return tokenizeTitleToSortedSet(title).filter(
        (token) => token.length >= 4 && !EDITORIAL_STOPWORDS.has(token) && !/^\d+$/.test(token)
    );
}

function publicArticle(article) {
    return {
        id: article.id,
        title: article.title,
        link: article.link,
        date: article.date,
        image: article.image,
        category: article.category || article.source?.category || 'Autre',
        source: {
            id: article.sourceId,
            name: article.source?.name || 'Source'
        }
    };
}

function buildEditorial(articles, now = Date.now()) {
    const recent = articles
        .filter((article) => {
            const timestamp = new Date(article.date).getTime();
            return Number.isFinite(timestamp) && timestamp <= now && timestamp >= now - 2 * DAY_MS;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);

    const clusters = [];
    const terms = new Map();

    for (const article of recent) {
        const tokens = extractKeywords(article.title);
        const timestamp = new Date(article.date).getTime();
        const category = article.category || article.source?.category || 'Autre';

        if (tokens.length >= 4) {
            // Merge into the strongest matching cluster within 24h in the same category,
            // regardless of sourceId; single-source clusters are filtered out afterward.
            let bestCluster = null;
            let bestScore = 0;

            for (const group of clusters) {
                if (group.category !== category) continue;
                if (Math.abs(timestamp - group.time) > DAY_MS) continue;
                const similarity = jaccardTitleSimilarity(group.tokens, tokens);
                if (similarity >= CLUSTER_JACCARD_THRESHOLD && similarity > bestScore) {
                    bestScore = similarity;
                    bestCluster = group;
                }
            }

            if (bestCluster) {
                bestCluster.items.push(article);
            } else {
                clusters.push({
                    tokens,
                    time: timestamp,
                    category,
                    items: [article]
                });
            }
        }

        for (const term of tokens) {
            if (!terms.has(term)) {
                terms.set(term, { term, current: 0, previous: 0, sources: new Set() });
            }
            const entry = terms.get(term);
            if (timestamp >= now - DAY_MS) {
                entry.current += 1;
                entry.sources.add(article.sourceId);
            } else {
                entry.previous += 1;
            }
        }
    }

    const topics = clusters
        .map((group) => ({
            id: group.items[0].id,
            title: group.items[0].title,
            category: group.category,
            sourceCount: new Set(group.items.map((item) => item.sourceId)).size,
            articleCount: group.items.length,
            latestDate: group.items[0].date,
            articles: group.items.map(publicArticle)
        }))
        .filter((group) => group.sourceCount >= 2)
        .sort(
            (a, b) =>
                b.sourceCount - a.sourceCount ||
                b.articleCount - a.articleCount ||
                b.id - a.id
        )
        .slice(0, 12);

    const trends = [...terms.values()]
        .filter((entry) => entry.sources.size >= 2 && entry.current >= 3)
        .map((entry) => ({
            term: entry.term,
            current: entry.current,
            previous: entry.previous,
            sourceCount: entry.sources.size,
            delta: entry.current - entry.previous
        }))
        .sort(
            (a, b) =>
                b.delta - a.delta ||
                b.sourceCount - a.sourceCount ||
                b.current - a.current ||
                a.term.localeCompare(b.term)
        )
        .slice(0, 15);

    return {
        topics,
        trends,
        sampleSize: recent.length,
        generatedAt: new Date(now).toISOString()
    };
}

module.exports = {
    buildEditorial,
    publicArticle
};
