import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink, Bot, Bookmark } from 'lucide-react';
import { summarizeArticle, toggleBookmark, getBookmarks } from '../services/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { recordOpened } from '../services/readerPreferences';

function safeHttp(value) {
    try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

function ArticleArtwork({article}){
    const image=safeHttp(article.image);
    const [failed,setFailed]=useState(false);
    if (!image||image===safeHttp(article.source?.image)||failed) return null;
    return <img src={image} alt="" loading="lazy" decoding="async" className="w-full aspect-[16/8] object-cover border-b theme-border" onError={()=>setFailed(true)}/>;
}

export default function ArticleCard({article}){
    const queryClient=useQueryClient();
    const [generatedSummary,setGeneratedSummary]=useState(null);
    const summary=generatedSummary||article.summary;
    const {data:bookmarks=[]}=useQuery({queryKey:['bookmarks'],queryFn:getBookmarks});
    const isBookmarked=bookmarks.some(item=>item.link===article.link);
    const [actionError,setActionError]=useState('');
    const [loading,setLoading]=useState(false);
    const link=safeHttp(article.link);
    const source=article.source?.name||'Source';
    const category=article.category||article.source?.category||'Autre';
    const date=new Date(article.date);
    const validDate=Number.isFinite(date.getTime());
    const excerpt=(article.content||'').replace(/<[^>]+>/g,'').trim();
    const rememberOpened=()=>{try{queryClient.setQueryData(['reader-history'],recordOpened(article));}catch{/* Opening the original must remain possible. */}};
    const handleSummarize=async()=>{
        setActionError('');setLoading(true);
        try{
            const data=await summarizeArticle(article.id);setGeneratedSummary(data.summary);
            queryClient.invalidateQueries({queryKey:['articles']});
            if(isBookmarked){
                const current=await getBookmarks();
                const next=current.map(a=>a.link===article.link?{...a,summary:data.summary}:a);
                try{localStorage.setItem('newsai-bookmarks-v1',JSON.stringify(next));queryClient.setQueryData(['bookmarks'],next);}catch{/* Summary is still available in the current view. */}
            }
        }catch(error){console.error(error);setActionError('Résumé indisponible. Réessayez plus tard.');}finally{setLoading(false);}
    };
    const handleBookmark=async()=>{
        setActionError('');
        try{queryClient.setQueryData(['bookmarks'],await toggleBookmark({...article,summary}));}
        catch(error){console.error(error);setActionError('Impossible de sauvegarder le favori sur cet appareil.');}
    };
    return <article className="flex flex-col min-w-0 border theme-border surface-card overflow-hidden">
        <ArticleArtwork key={article.image||'none'} article={article}/>
        <div className="p-4 sm:p-5 flex-1 flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0"><p className="text-xs font-semibold text-accent">{category}</p><p className="text-xs text-muted mt-1 break-words">{source}{validDate?' · '+formatDistanceToNow(date,{addSuffix:true,locale:fr}):''}</p></div>
                <button type="button" aria-pressed={isBookmarked} aria-label={isBookmarked?'Retirer des favoris':'Ajouter aux favoris'} title={isBookmarked?'Retirer des favoris':'Ajouter aux favoris'} onClick={handleBookmark} className="shrink-0 p-2 border theme-border rounded text-secondary hover:text-accent">
                    <Bookmark size={18} aria-hidden="true" className={isBookmarked?'fill-current text-accent':''}/>
                </button>
            </div>
            <h3 className="text-xl font-semibold leading-snug tracking-tight text-primary mb-3 break-words">
                {link?<a href={link} onClick={rememberOpened} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">{article.title}</a>:article.title}
            </h3>
            {summary?<div className="border-l-2 border-[var(--brand-primary)] pl-3 mb-3"><p className="text-xs font-semibold text-accent mb-1">Synthèse IA</p><p className="text-sm leading-6 text-secondary">{summary}</p></div>:excerpt?<p className="text-sm leading-6 text-secondary line-clamp-3 mb-3">{excerpt}</p>:null}
            {actionError&&<p role="alert" className="text-sm text-red-300 mb-3">{actionError}</p>}
            <div className="mt-auto pt-3 border-t theme-border flex items-center justify-between gap-3">
                {!summary&&<button type="button" onClick={handleSummarize} disabled={loading} className="inline-flex items-center gap-2 text-sm font-medium text-secondary hover:text-primary disabled:opacity-60"><Bot size={16} aria-hidden="true"/>{loading?'Analyse…':'Résumer'}</button>}
                {link&&<a href={link} onClick={rememberOpened} target="_blank" rel="noopener noreferrer" aria-label="Lire l’article original" className="ml-auto inline-flex gap-1.5 items-center text-sm font-medium text-accent hover:underline">Source <ExternalLink size={15} aria-hidden="true"/></a>}
            </div>
        </div>
    </article>;
}
