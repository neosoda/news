import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
});

const ADMIN_TOKEN_STORAGE_KEY = 'newsai-admin-token';
const BOOKMARK_KEY = 'newsai-bookmarks-v1';

function getSessionStorage() {
    return typeof window === 'undefined' ? null : window.sessionStorage;
}

function applyAdminToken(token) {
    if (token) {
        api.defaults.headers.common['X-Admin-Token'] = token;
    } else {
        delete api.defaults.headers.common['X-Admin-Token'];
    }
}

applyAdminToken(getSessionStorage()?.getItem(ADMIN_TOKEN_STORAGE_KEY) || '');

export const hasAdminToken = () => Boolean(getSessionStorage()?.getItem(ADMIN_TOKEN_STORAGE_KEY));

export const setAdminToken = (token) => {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (!normalized) return false;
    getSessionStorage()?.setItem(ADMIN_TOKEN_STORAGE_KEY, normalized);
    applyAdminToken(normalized);
    return true;
};

export const clearAdminToken = () => {
    getSessionStorage()?.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    applyAdminToken('');
};

export const getArticles = async (page = 1, search = '', category = '', filters = {}) => {
    const { data } = await api.get('/articles', {
        params: {
            page,
            search,
            category,
            period: filters.period || undefined,
            sourceId: filters.sourceId || undefined,
            excludeSources: filters.excludeSources?.length
                ? filters.excludeSources.join(',')
                : undefined
        }
    });
    return data;
};

export const getSources = async () => {
    const { data } = await api.get('/sources');
    return data;
};

export const getSourcesHealth = async () => {
    const { data } = await api.get('/sources/health');
    return data;
};

export const addSource = async (source) => {
    const { data } = await api.post('/sources', source);
    return data;
};

export const reactivateSource = async (id) => {
    const { data } = await api.post(`/sources/${id}/reactivate`);
    return data;
};

export const deleteSource = async (id) => {
    const { data } = await api.delete(`/sources/${id}`);
    return data;
};

export const refreshSources = async () => {
    const { data } = await api.post('/sources/refresh');
    return data;
};

export const summarizeArticle = async (id) => {
    const { data } = await api.post(`/articles/${id}/summarize`);
    return data;
};

function readStoredBookmarks() {
    try {
        const raw = window.localStorage.getItem(BOOKMARK_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && typeof item.link === 'string' && typeof item.title === 'string');
    } catch {
        return [];
    }
}

export const getBookmarks = async () => readStoredBookmarks();

export const toggleBookmark = async (article) => {
    const current = readStoredBookmarks();
    const exists = current.some((item) => item.link === article.link);
    const next = exists
        ? current.filter((item) => item.link !== article.link)
        : [{ ...article, isBookmarked: true }, ...current];
    window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
    return next;
};

export const updateBookmarkedSummary = (link, summary) => {
    const current = readStoredBookmarks();
    if (!current.some((item) => item.link === link)) return current;
    const next = current.map((item) => (item.link === link ? { ...item, summary } : item));
    window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
    return next;
};

export const getDailyBrief = async () => {
    const { data, headers } = await api.get('/daily-brief');
    return { briefs: data, stale: headers['x-brief-stale'] === 'true' };
};

export const getArticleStats = async () => {
    const { data } = await api.get('/articles/stats');
    return data;
};

export const getHealth = async () => {
    const { data } = await api.get('/health');
    return data;
};

export const getVideos = async ({ query = '', topics = '', limit = 24 } = {}) => {
    const { data } = await api.get('/videos', {
        params: { query, topics, limit }
    });
    return data;
};

export const getEditorial = async () => {
    const { data } = await api.get('/editorial');
    return data;
};

export const getArticleSources = async () => {
    const { data } = await api.get('/article-sources');
    return data;
};

export const getKev = async (search = '', page = 1, { ransomware = false } = {}) => {
    const { data } = await api.get('/cyber/kev', {
        params: {
            search: search || undefined,
            page,
            ransomware: ransomware ? 'known' : undefined
        }
    });
    return data;
};

export const getCert = async (search = '') => {
    const { data } = await api.get('/cyber/cert', {
        params: { search: search || undefined }
    });
    return data;
};

export const getBriefArchive = async () => {
    const { data } = await api.get('/brief-archive');
    return data;
};

export const getBriefEdition = async (date) => {
    const { data } = await api.get(`/brief-archive/${encodeURIComponent(date)}`);
    return { briefs: data, stale: false };
};

export const getSourceObservatory = async () => {
    const { data } = await api.get('/source-observatory');
    return data;
};
