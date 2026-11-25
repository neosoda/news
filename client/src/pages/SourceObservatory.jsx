import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getSourceObservatory } from '../services/api';
export default function SourceObservatory(){
    const [search,setSearch]=useState('');
    const {data=[],isPending,isError,refetch}=useQuery({queryKey:['source-observatory'],queryFn:getSourceObservatory,staleTime:300000});
    const rows=data.filter(s=>(s.name+' '+s.category).toLowerCase().includes(search.toLowerCase()));
    const date=value=>value?new Date(value).toLocaleString('fr-FR'):'—';
    return <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-b theme-border pb-6"><p className="text-sm text-accent">Transparence de la collecte</p><h1 className="font-serif text-4xl md:text-5xl text-primary mt-2">Observatoire des sources</h1><p className="mt-3 text-secondary">Activité des flux et volume des articles collectés sur sept jours. Ces chiffres ne mesurent pas la fiabilité journalistique des médias.</p></header>
        <div className="flex flex-wrap gap-4 items-end justify-between"><label className="text-sm text-secondary">Filtrer les sources<input value={search} onChange={e=>setSearch(e.target.value)} className="block mt-1 theme-input border rounded px-3 py-2"/></label><Link to="/sources" className="text-sm text-accent underline">Administration des sources</Link></div>
        {isPending?<p role="status">Chargement…</p>:isError?<p role="alert">Observatoire indisponible. <button className="underline" onClick={()=>refetch()}>Réessayer</button></p>:<>
            <p className="text-sm text-muted">{rows.length} sources affichées · {data.filter(s=>s.isActive).length} actives sur {data.length}</p>
            {!rows.length?<p className="py-8 text-secondary">Aucune source correspondante.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b theme-border text-secondary"><th scope="col" className="p-3">Source</th><th scope="col" className="p-3">État</th><th scope="col" className="p-3">Articles / 7 j</th><th scope="col" className="p-3">Dernier article</th><th scope="col" className="p-3">Dernière collecte</th></tr></thead><tbody>{rows.map(s=><tr key={s.id} className="border-b theme-border"><th scope="row" className="p-3 font-medium text-primary">{s.name}<span className="block text-xs text-muted">{s.category}</span></th><td className="p-3 text-secondary">{!s.isActive?'Désactivée':s.consecutiveFailures?'En difficulté':'Active'}</td><td className="p-3 tabular-nums">{s.articles7d}</td><td className="p-3 whitespace-nowrap text-secondary">{date(s.lastArticle)}</td><td className="p-3 whitespace-nowrap text-secondary">{date(s.lastFetched)}</td></tr>)}</tbody></table></div>}
        </>}
    </div>;
}
