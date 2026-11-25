import { useDeferredValue,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getKev,getCert } from '../services/api';
export default function CyberRadar(){
    const [search,setSearch]=useState('');
    const [page,setPage]=useState(1);
    const deferred=useDeferredValue(search);
    const kev=useQuery({queryKey:['kev',deferred,page],queryFn:()=>getKev(deferred,page),staleTime:300000});
    const cert=useQuery({queryKey:['cert'],queryFn:getCert,staleTime:300000});
    const meta=kev.data?.meta;
    return <div className="mx-auto max-w-6xl space-y-8">
        <header className="border-b theme-border pb-6">
            <p className="text-sm text-accent font-semibold">Veille opérationnelle · Sources officielles</p>
            <h1 className="font-serif text-4xl md:text-5xl text-primary mt-2">Cyber Radar</h1>
            <p className="mt-3 text-secondary max-w-3xl">Vulnérabilités dont l'exploitation est documentée par la CISA et dernières publications du CERT-FR. Les échéances CISA concernent les agences fédérales américaines, pas votre propre organisation.</p>
        </header>
        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
            <section className="min-w-0">
                <h2 className="font-serif text-2xl text-primary">Vulnérabilités exploitées</h2>
                <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noreferrer" className="text-sm text-accent underline">Catalogue officiel CISA KEV</a>
                <label className="block mt-4 text-sm text-secondary">Rechercher une CVE, un éditeur ou un produit<input className="block mt-2 w-full theme-input border rounded px-3 py-2" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Ex. Microsoft, Fortinet, CVE-…"/></label>
                {kev.isPending?<p role="status" className="py-6">Chargement du catalogue…</p>:kev.isError?<p role="alert" className="py-6">Catalogue indisponible. <button onClick={()=>kev.refetch()} className="underline">Réessayer</button></p>:<>
                    <p className="text-xs text-muted my-3">{meta.total} résultats sur {meta.catalogSize} · Collecte {new Date(meta.fetchedAt).toLocaleString('fr-FR')}</p>
                    {meta.stale&&<p role="status" className="text-sm text-secondary">Dernier catalogue disponible, actualisation en échec.</p>}
                    {!kev.data.data.length&&<p className="py-6 text-secondary">Aucune vulnérabilité correspondante.</p>}
                    {kev.data.data.map(v=><article key={v.cve} className="border-t theme-border py-4">
                        <div className="flex flex-wrap justify-between gap-2"><a href={'https://www.cve.org/CVERecord?id='+v.cve} target="_blank" rel="noreferrer" className="font-mono text-accent underline">{v.cve}</a><span className="text-xs text-muted">Ajout : {v.added}</span></div>
                        <h3 className="font-semibold text-primary mt-2">{v.vendor} · {v.product}</h3>
                        <p className="text-sm text-secondary mt-1">{v.name}</p>
                        {v.ransomware==='Known'&&<p className="text-sm text-red-300 mt-2">Usage connu dans une campagne de rançongiciel</p>}
                        <details className="mt-3 text-sm text-secondary"><summary className="cursor-pointer font-medium">Description et action CISA (anglais)</summary><p className="mt-2">{v.description}</p><p className="mt-2">{v.action}</p>{v.due&&<p className="mt-2">Échéance fédérale : {v.due}</p>}</details>
                    </article>)}
                    {meta.pages>1&&<div className="flex items-center justify-between border-t theme-border py-4"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="border theme-border px-3 py-2 disabled:opacity-50">Précédent</button><span className="text-sm">Page {page} / {meta.pages}</span><button disabled={page>=meta.pages} onClick={()=>setPage(p=>p+1)} className="border theme-border px-3 py-2 disabled:opacity-50">Suivant</button></div>}
                </>}
            </section>
            <aside className="min-w-0">
                <h2 className="font-serif text-2xl text-primary">Derniers avis CERT-FR</h2>
                <a href="https://www.cert.ssi.gouv.fr/" target="_blank" rel="noreferrer" className="text-sm text-accent underline">Consulter le CERT-FR</a>
                {cert.isPending?<p role="status" className="py-5">Chargement des avis…</p>:cert.isError?<p role="alert" className="py-5">Avis indisponibles. <button onClick={()=>cert.refetch()} className="underline">Réessayer</button></p>:cert.data.length===0?<p className="py-5 text-secondary">Aucun avis collecté pour le moment.</p>:cert.data.map(a=><article key={a.id} className="border-b theme-border py-4"><p className="text-xs text-muted">{a.source.name} · {new Date(a.date).toLocaleDateString('fr-FR')}</p><a href={a.link} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{a.title}</a>{a.cves.length>0&&<p className="text-xs text-accent mt-2 break-words">{a.cves.join(' · ')}</p>}</article>)}
            </aside>
        </div>
    </div>;
}
