const HISTORY_KEY = 'newsai-opened-articles-v1';
const HIDDEN_KEY = 'newsai-hidden-sources-v1';

function readArray(key) {
    try {
        const value = JSON.parse(window.localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

export function getHiddenSources() {
    return readArray(HIDDEN_KEY).filter(Number.isSafeInteger).slice(0, 100);
}

export function saveHiddenSources(ids) {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(0, 100)));
}

export function clearHiddenSources() {
    window.localStorage.removeItem(HIDDEN_KEY);
}

export function getHistory() {
    return readArray(HISTORY_KEY)
        .filter((item) => item && typeof item.link === 'string' && typeof item.title === 'string')
        .slice(0, 100);
}

export function recordOpened(article) {
    const { id, title, link, date, category, source } = article;
    const entry = {
        id,
        title,
        link,
        date,
        category,
        source: { name: source?.name || 'Source' },
        openedAt: new Date().toISOString()
    };
    const next = [entry, ...getHistory().filter((item) => item.link !== link)].slice(0, 100);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
}

export function clearHistory() {
    window.localStorage.removeItem(HISTORY_KEY);
}
