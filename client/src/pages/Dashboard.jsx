import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getArticles, getArticleStats, getArticleSources, getEditorial } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { getHiddenSources, saveHiddenSources } from '../services/readerPreferences';

const KEY='newsai-followed-keywords-v1';
function initialKeywords() {
    try { const v=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,20):[]; } catch { return []; }
}
export default function Dashboard({ search, category, setCategory }) {
    const [params,setParams]=useSearchParams();
    const period=params.get('period')||'';
    const sourceId=params.get('source')||'';
    const [followed,setFollowed]=useState(initialKeywords);
    const [hidden,setHidden]=useState(getHiddenSources);
    const [storageError,setStorageError]=useState(false);
    const {data:stats}=useQuery({queryKey:['article-stats'],queryFn:getArticleStats,staleTime:60000});
    const {data:sources=[],isError:sourcesError}=useQuery({queryKey:['article-sources'],queryFn:getArticleSources,staleTime:300000});
    const {data:editorial}=useQuery({queryKey:['editorial'],queryFn:getEditorial,staleTime:300000});
    const {data,fetchNextPage,hasNextPage,isFetchingNextPage,status,refetch,isFetchNextPageError}=useInfiniteQuery({
        queryKey:['articles',search,category,period,sourceId,hidden],
        queryFn:({pageParam})=>getArticles(pageParam,search,category,{period,sourceId,excludeSources:hidden}),
        initialPageParam:1,
        getNextPageParam:last=>last.pagination.page<last.pagination.pages?last.pagination.page+1:undefined
    });
    const categories=Object.keys(stats?.stats||{}).sort((a,b)=>stats.stats[b]-stats.stats[a]);
    const articles=[...new Map((data?.pages.flatMap(page=>page.data)||[]).map(a=>[a.id,a])).values()];
    const total=data?.pages[0]?.pagination.total;
    const setFilter=(key,value)=>setParams(old=>{const next=new URLSearchParams(old);if(value)next.set(key,value);else next.delete(key);return next;},{replace:true});
    const toggleFollow=()=>{
        const value=search.trim();
        if(!value)return;
        const next=followed.includes(value)?followed.filter(x=>x!==value):[value,...followed].slice(0,20);
        try {localStorage.setItem(KEY,JSON.stringify(next));setFollowed(next);setStorageError(false);}catch{setStorageError(true);}
    };
    const reset=()=>setParams({},{replace:true});
    const toggleHidden=id=>{const next=hidden.includes(id)?hidden.filter(x=>x!==id):[...hidden,id].slice(0,100);try{saveHiddenSources(next);setHidden(next);setStorageError(false);}catch{setStorageError(true);}};
    return <div className="mx-auto max-w-[1400px] space-y-7">
        <header className="border-b-2 theme-border pb-5 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs uppercase tracking-widest font-semibold text-accent">La veille technologique</p>
                <h1 className="font-serif text-4xl sm:text-5xl leading-tight text-primary mt-2">Tech & IA, au quotidien</h1>
                <p className="text-secondary mt-2 text-sm">Les dernières publications, leurs sources et les sujets qui comptent.</p></div>
            <Link to="/daily-brief" className="border theme-border px-4 py-2 text-sm font-semibold hover:underline">Lire le brief du jour →</Link>
        </header>
        <section aria-label="Filtres de recherche" className="space-y-3">
            <div className="flex flex-wrap gap-2 border-b theme-border pb-3">
                {['',...categories].map(cat=><button type="button" key={cat} aria-pressed={category===cat} onClick={()=>setCategory(cat)} className={`px-3 py-2 border text-sm font-medium ${category===cat?'border-[var(--brand-primary)] text-accent':'theme-border text-secondary'}`}>{cat||'Tout'}</button>)}
            </div>
            <div className="flex flex-wrap gap-3 items-end">
                <label className="text-xs text-secondary">Période<select className="block mt-1 theme-input border rounded px-3 py-2 text-sm" value={period} onChange={e=>setFilter('period',e.target.value)}><option value="">Toutes les dates</option><option value="24h">24 heures</option><option value="7d">7 jours</option><option value="30d">30 jours</option></select></label>
                <label className="text-xs text-secondary min-w-0 max-w-full">Source<select className="block mt-1 theme-input border rounded px-3 py-2 text-sm max-w-full" value={sourceId} onChange={e=>setFilter('source',e.target.value)}><option value="">Toutes les sources</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <button type="button" className="text-sm text-secondary underline py-2" onClick={reset}>Réinitialiser</button>
                {search.trim()&&<button type="button" className="text-sm text-accent underline py-2" onClick={toggleFollow} aria-pressed={followed.includes(search.trim())}>{followed.includes(search.trim())?'Ne plus suivre':'Suivre cette recherche'}</button>}
            </div>
            <details className="text-sm text-secondary"><summary className="cursor-pointer">Personnaliser les sources ({hidden.length} masquées)</summary><div className="max-h-56 overflow-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-2 border theme-border p-3 mt-2">{sources.map(s=><label key={s.id} className="flex gap-2 items-center"><input type="checkbox" checked={!hidden.includes(s.id)} onChange={()=>toggleHidden(s.id)}/>{s.name}</label>)}</div><p className="text-xs mt-2">Les sources masquées restent consultables en les sélectionnant explicitement.</p></details>
            {sourcesError&&<p role="status" className="text-sm text-secondary">Liste des sources indisponible.</p>}
            {storageError&&<p role="alert" className="text-sm text-secondary">Impossible d'enregistrer vos préférences dans le navigateur.</p>}
            {followed.length>0&&<div className="flex flex-wrap gap-2 items-center"><span className="text-xs text-muted">Mes recherches</span>{followed.map(term=><button type="button" key={term} className="border theme-border rounded px-2 py-1 text-sm text-secondary" onClick={()=>setFilter('q',term)}>{term}</button>)}</div>}
        </section>
        <div className="grid xl:grid-cols-[minmax(0,1fr)_260px] gap-8">
            <section aria-label="Actualités">
                <div className="flex items-center justify-between border-b theme-border pb-3 mb-4"><h2 className="font-serif text-2xl text-primary">Dernières publications</h2>{typeof total==='number'&&<span className="text-sm text-muted">{total} articles</span>}</div>
                {status==='pending'?<p role="status" className="py-10 text-secondary">Chargement des actualités…</p>:status==='error'&&!articles.length?<div role="alert" className="py-8 text-secondary">Actualités indisponibles. <button className="underline" onClick={()=>refetch()}>Réessayer</button></div>:<>
                    {!articles.length&&<div className="py-12 text-secondary">Aucun article ne correspond aux filtres. <button onClick={reset} className="underline">Tout afficher</button></div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">{articles.map(a=><ArticleCard key={a.id} article={a}/>)}</div>
                    {hasNextPage&&<button type="button" disabled={isFetchingNextPage} onClick={()=>fetchNextPage()} className="mx-auto block my-8 border theme-border px-5 py-3 text-sm font-semibold text-primary">{isFetchingNextPage?'Chargement…':isFetchNextPageError?'Réessayer':'Plus d’articles'}</button>}
                    {!hasNextPage&&articles.length>0&&<p className="text-center text-sm text-muted py-8">Fin des résultats</p>}
                </>}
            </section>
            <aside className="space-y-4">
                <h2 className="font-serif text-2xl text-primary border-b theme-border pb-3">À la une des sources</h2>
                {editorial?.topics.slice(0,4).map(t=><article key={t.id} className="border-b theme-border pb-4"><p className="text-xs text-accent">{t.sourceCount} sources · {t.category}</p><h3 className="text-primary font-semibold mt-1">{t.title}</h3></article>)}
                {!editorial?.topics.length&&<p className="text-sm text-secondary">Les dossiers apparaissent lorsque plusieurs sources publient des titres similaires.</p>}
                <Link to="/editorial" className="text-sm font-semibold text-accent hover:underline">Tous les dossiers et tendances →</Link>
                <Link to="/cyber" className="block text-sm font-semibold text-accent hover:underline">Cyber Radar →</Link>
            </aside>
        </div>
    </div>;
}
