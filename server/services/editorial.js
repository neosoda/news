const { tokenizeTitleToSortedSet, jaccardTitleSimilarity } = require('./articleDedup');
const STOP = new Set(['plus','cette','tout','tous','faire','annonce','article','actualite','nouveaux','nouveau','nouvelle','peut','sera','contre','apres','avant','entre','about','sont','leurs','ainsi','dont','sans','avec','pour','dans']);
const DAY = 86400000;
function keywords(title) {
    return tokenizeTitleToSortedSet(title).filter(t => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t));
}
function publicArticle(a) {
    return { id: a.id, title: a.title, link: a.link, date: a.date, image: a.image, category: a.category || a.source?.category || 'Autre', source: { id: a.sourceId, name: a.source?.name || 'Source' } };
}
function buildEditorial(articles, now = Date.now()) {
    const recent = articles.filter(a => {
        const time = new Date(a.date).getTime();
        return time <= now && time >= now - 2 * DAY;
    }).sort((a,b) => new Date(b.date) - new Date(a.date) || b.id-a.id);
    const clusters = [];
    const terms = new Map();
    for (const a of recent) {
        const tokens = keywords(a.title);
        const time = new Date(a.date).getTime();
        if (tokens.length >= 4) {
            const candidate = clusters.find(g => g.category === (a.category || a.source?.category || 'Autre') &&
                Math.abs(time - g.time) <= DAY && g.items.some(x => x.sourceId !== a.sourceId) &&
                jaccardTitleSimilarity(g.tokens, tokens) >= 0.65);
            if (candidate) candidate.items.push(a);
            else clusters.push({ tokens, time, category: a.category || a.source?.category || 'Autre', items: [a] });
        }
        for (const term of tokens) {
            if (!terms.has(term)) terms.set(term, { term, current: 0, previous: 0, sources: new Set() });
            const t = terms.get(term);
            if (time >= now - DAY) { t.current++; t.sources.add(a.sourceId); }
            else t.previous++;
        }
    }
    const topics = clusters.map(g => ({ id: g.items[0].id, title: g.items[0].title, category: g.category,
        sourceCount: new Set(g.items.map(a => a.sourceId)).size, articleCount: g.items.length,
        articles: g.items.map(publicArticle) })).filter(g => g.sourceCount >= 2)
        .sort((a,b) => b.sourceCount-a.sourceCount || b.articleCount-a.articleCount || b.id-a.id).slice(0,12);
    const trends = [...terms.values()].filter(t => t.sources.size >= 2 && t.current >= 3)
        .map(t => ({ term:t.term, current:t.current, previous:t.previous, sourceCount:t.sources.size, delta:t.current-t.previous }))
        .sort((a,b) => b.delta-a.delta || b.sourceCount-a.sourceCount || b.current-a.current || a.term.localeCompare(b.term)).slice(0,15);
    return { topics, trends, sampleSize:recent.length, generatedAt:new Date(now).toISOString() };
}
module.exports = { buildEditorial, publicArticle };
