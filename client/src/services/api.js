import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
});

const ADMIN_TOKEN_STORAGE_KEY = 'newsai-admin-token';

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
    const { data } = await api.get('/articles', { params: { page, search, category, period:filters.period, sourceId:filters.sourceId, excludeSources:filters.excludeSources?.join(',') } });
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

const BOOKMARK_KEY = 'newsai-bookmarks-v1';
export const getBookmarks = async () => {
    const parsed = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) || '[]');
    if (!Array.isArray(parsed)) throw new Error('Invalid bookmarks');
    return parsed;
};

export const toggleBookmark = async (article) => {
    const current = JSON.parse(window.localStorage.getItem(BOOKMARK_KEY) || '[]');
    if (!Array.isArray(current)) throw new Error('Invalid bookmarks');
    const exists = current.some(item => item.link === article.link);
    const next = exists ? current.filter(item => item.link !== article.link) : [{ ...article, isBookmarked: true }, ...current];
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
        params: {
            query,
            topics,
            limit
        }
    });
    return data;
};

export const getEditorial = async () => (await api.get('/editorial')).data;

export const getArticleSources = async () => (await api.get('/article-sources')).data;

export const getKev = async (search='',page=1) => (await api.get('/cyber/kev',{params:{search,page}})).data;
export const getCert = async () => (await api.get('/cyber/cert')).data;

export const getBriefArchive = async () => (await api.get('/brief-archive')).data;
export const getBriefEdition = async date => ({briefs:(await api.get('/brief-archive/'+encodeURIComponent(date))).data,stale:false});
export const getSourceObservatory = async () => (await api.get('/source-observatory')).data;
