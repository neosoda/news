import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
});

export const getArticles = async (page = 1, search = '', category = '') => {
    const { data } = await api.get('/articles', { params: { page, search, category } });
    return data;
};

export const getSources = async () => {
    const { data } = await api.get('/sources');
    return data;
};

export const addSource = async (source) => {
    const { data } = await api.post('/sources', source);
    return data;
};

export const deleteSource = async (id) => {
    const { data } = await api.delete(`/sources/${id}`);
    return data;
};

export const refreshSources = async () => {
    const { data } = await api.get('/sources/refresh');
    return data;
};

export const summarizeArticle = async (id) => {
    const { data } = await api.post(`/articles/${id}/summarize`);
    return data;
};

export const getBookmarks = async () => {
    const { data } = await api.get('/bookmarks');
    return data;
};

export const toggleBookmark = async (id) => {
    const { data } = await api.post(`/articles/${id}/bookmark`);
    return data;
};

export const getDailyBrief = async () => {
    const { data } = await api.get('/daily-brief');
    return data;
};
