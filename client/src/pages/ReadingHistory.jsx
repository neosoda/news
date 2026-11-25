import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { getHistory,clearHistory } from '../services/readerPreferences';
export default function ReadingHistory(){
    const client=useQueryClient();
    const {data=[]}=useQuery({queryKey:['reader-history'],queryFn:getHistory});
    const [filter,setFilter]=useState('');
    const [confirm,setConfirm]=useState(false);
    const [error,setError]=useState(false);
    const rows=data.filter(a=>(a.title+' '+(a.source?.name||'')).toLowerCase().includes(filter.toLowerCase()));
    return <div className="mx-auto max-w-4xl space-y-6">
        <header className="border-b theme-border pb-6"><h1 className="font-serif text-4xl text-primary">Historique de lecture</h1><p className="mt-3 text-secondary">Les 100 derniers articles ouverts depuis ce navigateur. Aucun historique n’est envoyé au serveur.</p></header>
        <div className="flex flex-wrap justify-between gap-3"><label className="text-sm text-secondary">Filtrer<input value={filter} onChange={e=>setFilter(e.target.value)} className="block mt-1 border theme-input rounded px-3 py-2"/></label>{data.length>0&&<button type="button" onClick={()=>setConfirm(true)} className="self-end underline text-sm text-secondary">Effacer l’historique</button>}</div>
        {confirm&&<div role="alert" className="border theme-border p-4 space-y-3"><p>Effacer l’historique de ce navigateur ?</p><button type="button" className="border theme-border px-3 py-2 mr-3" onClick={()=>{try{clearHistory();client.setQueryData(['reader-history'],[]);setConfirm(false);setError(false);}catch{setError(true);}}}>Effacer</button><button type="button" onClick={()=>setConfirm(false)}>Annuler</button></div>}
        {error&&<p role="alert">Impossible d’effacer l’historique.</p>}
        {!rows.length&&<p className="text-secondary py-6">{data.length?'Aucun résultat.':'Aucun article ouvert.'}</p>}
        {rows.map(a=><article key={a.link} className="border-b theme-border pb-4"><p className="text-xs text-muted">{a.source?.name} · {new Date(a.openedAt).toLocaleString('fr-FR')}</p><a href={a.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">{a.title}</a></article>)}
    </div>;
}
