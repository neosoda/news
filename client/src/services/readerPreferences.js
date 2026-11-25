const HISTORY='newsai-opened-articles-v1';
const HIDDEN='newsai-hidden-sources-v1';
function read(key) {
    try {const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];} catch{return [];}
}
export const getHiddenSources=()=>read(HIDDEN).filter(Number.isSafeInteger).slice(0,100);
export function saveHiddenSources(ids){localStorage.setItem(HIDDEN,JSON.stringify(ids.slice(0,100)));}
export const getHistory=()=>read(HISTORY).filter(a=>a&&typeof a.link==='string'&&typeof a.title==='string').slice(0,100);
export function recordOpened(article){
    const {id,title,link,date,category,source}=article;
    const next=[{id,title,link,date,category,source:{name:source?.name},openedAt:new Date().toISOString()},...getHistory().filter(a=>a.link!==link)].slice(0,100);
    localStorage.setItem(HISTORY,JSON.stringify(next));return next;
}
export function clearHistory(){localStorage.removeItem(HISTORY);}
