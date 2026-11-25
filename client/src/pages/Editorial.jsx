import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getEditorial } from '../services/api';

export default function Editorial() {
    const {data, isPending, isError, refetch} = useQuery({queryKey:['editorial'],queryFn:getEditorial,staleTime:300000});
    return <div className="mx-auto max-w-6xl space-y-8">
        <header className="border-b theme-border pb-6">
            <p className="text-sm text-accent font-semibold">Panorama · 48 heures</p>
            <h1 className="font-serif text-4xl md:text-5xl text-primary mt-2">Dossiers et tendances</h1>
            <p className="mt-3 text-secondary max-w-3xl">Croisez les titres de plusieurs sources et repérez les thèmes qui gagnent en visibilité. Les rapprochements sont automatiques, sans prétendre confirmer les faits.</p>
        </header>
        {isPending ? <p role="status">Analyse des articles…</p> : isError ? <div role="alert">Analyse indisponible. <button className="underline" onClick={()=>refetch()}>Réessayer</button></div> : <>
            <p className="text-sm text-muted">{data.sampleSize} articles analysés (maximum 500) · {new Date(data.generatedAt).toLocaleString('fr-FR')}</p>
            <section className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
                <div>
                    <h2 className="text-2xl font-serif text-primary border-b theme-border pb-3">Sujets couverts par plusieurs médias</h2>
                    {!data.topics.length && <p className="py-6 text-secondary">Aucun rapprochement suffisamment fiable dans la période.</p>}
                    {data.topics.map(topic=><article key={topic.id} className="border-b theme-border py-5">
                        <p className="text-xs text-accent font-semibold">{topic.category} · {topic.sourceCount} sources · {topic.articleCount} articles</p>
                        <h3 className="text-xl font-semibold text-primary mt-2">{topic.title}</h3>
                        <ul className="mt-3 space-y-3">{topic.articles.map(a=><li key={a.id}><a className="text-secondary hover:underline" href={a.link} target="_blank" rel="noreferrer">{a.title}</a><p className="text-xs text-muted">{a.source.name} · {new Date(a.date).toLocaleDateString('fr-FR')}</p></li>)}</ul>
                    </article>)}
                </div>
                <aside>
                    <h2 className="text-2xl font-serif text-primary border-b theme-border pb-3">Mots-clés en mouvement</h2>
                    <p className="text-sm text-secondary mt-3">Occurrences dans les titres, sur 24 h contre les 24 h précédentes.</p>
                    {!data.trends.length && <p className="py-6 text-secondary">Pas encore de tendance multisource.</p>}
                    <ol className="divide-y divide-[var(--color-border)]">{data.trends.map(t=><li key={t.term} className="py-3">
                        <Link className="font-semibold text-primary hover:underline" to={'/?q='+encodeURIComponent(t.term)}>{t.term}</Link>
                        <p className="text-sm text-secondary">{t.current} mentions · {t.sourceCount} sources · {t.delta>0?'+':''}{t.delta} vs veille</p>
                    </li>)}</ol>
                </aside>
            </section>
        </>}
    </div>;
}
