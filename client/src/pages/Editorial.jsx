import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers, TrendingUp, RefreshCw } from 'lucide-react';
import { getEditorial } from '../services/api';
import { recordOpened } from '../services/readerPreferences';
import { safeHttpUrl, formatDateTime, formatShortDate } from '../utils/url';

export default function Editorial() {
    const queryClient = useQueryClient();
    const { data, isPending, isError, refetch } = useQuery({
        queryKey: ['editorial'],
        queryFn: getEditorial,
        staleTime: 300000
    });

    const handleOpenArticle = (article) => {
        try {
            queryClient.setQueryData(['reader-history'], recordOpened(article));
        } catch {
            // Opening the article must remain possible.
        }
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8">
            <header className="border-b theme-border pb-6">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    <Layers size={14} aria-hidden="true" />
                    Panorama · 48 heures
                </p>
                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                    Dossiers et tendances
                </h1>
                <p className="mt-3 text-sm leading-6 text-secondary max-w-3xl">
                    Croisement automatique des titres publiés par plusieurs sources et suivi des mots-clés en progression.
                    Les rapprochements sont heuristiques et ne constituent pas une vérification factuelle.
                </p>
            </header>

            {isPending ? (
                <div role="status" className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8 animate-pulse">
                    <div className="space-y-4">
                        {[0, 1, 2].map((index) => (
                            <div key={index} className="surface-card p-5 space-y-3">
                                <div className="h-3 w-36 rounded surface-muted" />
                                <div className="h-6 w-3/4 rounded surface-muted" />
                                <div className="h-4 w-full rounded surface-muted" />
                            </div>
                        ))}
                    </div>
                    <div className="surface-card p-5 space-y-3">
                        <div className="h-5 w-44 rounded surface-muted" />
                        <div className="h-10 w-full rounded surface-muted" />
                        <div className="h-10 w-full rounded surface-muted" />
                    </div>
                </div>
            ) : isError ? (
                <div role="alert" className="surface-card p-8 text-center space-y-3">
                    <p className="text-sm text-secondary">L’analyse éditoriale est momentanément indisponible.</p>
                    <button type="button" onClick={() => refetch()} className="editorial-btn">
                        <RefreshCw size={14} aria-hidden="true" />
                        Réessayer
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span className="tabular-nums">
                            {data.sampleSize} article{data.sampleSize > 1 ? 's' : ''} analysé{data.sampleSize > 1 ? 's' : ''} (échantillon maximal : 500)
                        </span>
                        <span className="tabular-nums">Mis à jour le {formatDateTime(data.generatedAt)}</span>
                    </div>

                    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8 items-start">
                        <section aria-label="Sujets couverts par plusieurs médias" className="space-y-4 min-w-0">
                            <div className="flex items-baseline justify-between border-b theme-border pb-3">
                                <h2 className="font-serif text-2xl font-semibold text-primary">
                                    Sujets couverts par plusieurs médias
                                </h2>
                                <span className="text-xs text-muted tabular-nums">
                                    {data.topics.length} dossier{data.topics.length > 1 ? 's' : ''}
                                </span>
                            </div>

                            {data.topics.length === 0 ? (
                                <div className="surface-card p-8 text-center">
                                    <p className="text-sm text-secondary">
                                        Aucun rapprochement multisource suffisamment fiable sur les 48 dernières heures.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {data.topics.map((topic) => (
                                        <article
                                            key={topic.id}
                                            id={`dossier-${topic.id}`}
                                            className="scroll-mt-24 surface-card p-5 space-y-4"
                                        >
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className="rounded-md border theme-border surface-muted px-2 py-0.5 font-semibold text-accent">
                                                        {topic.category}
                                                    </span>
                                                    <span className="font-semibold text-secondary tabular-nums">
                                                        {topic.sourceCount} sources · {topic.articleCount} articles
                                                    </span>
                                                </div>
                                                <h3 className="font-serif text-xl font-semibold leading-snug text-primary mt-2.5">
                                                    {topic.title}
                                                </h3>
                                            </div>

                                            <ul className="divide-y divide-[var(--color-border)] border-t theme-border">
                                                {topic.articles.map((article) => {
                                                    const href = safeHttpUrl(article.link);
                                                    return (
                                                        <li key={article.id} className="py-3 first:pt-3 last:pb-0">
                                                            {href ? (
                                                                <a
                                                                    href={href}
                                                                    onClick={() => handleOpenArticle(article)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="group flex items-start justify-between gap-3"
                                                                >
                                                                    <div className="min-w-0">
                                                                        <span className="block text-sm font-medium text-primary group-hover:text-accent group-hover:underline underline-offset-4">
                                                                            {article.title}
                                                                        </span>
                                                                        <span className="mt-1 block text-xs text-muted">
                                                                            {article.source?.name || 'Source'} · {formatShortDate(article.date)}
                                                                        </span>
                                                                    </div>
                                                                    <ArrowUpRight size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted group-hover:text-accent" />
                                                                </a>
                                                            ) : (
                                                                <div>
                                                                    <span className="block text-sm font-medium text-primary">{article.title}</span>
                                                                    <span className="mt-1 block text-xs text-muted">
                                                                        {article.source?.name || 'Source'} · {formatShortDate(article.date)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <aside aria-label="Mots-clés en mouvement" className="surface-card p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b theme-border pb-3">
                                <TrendingUp size={16} aria-hidden="true" className="text-accent" />
                                <h2 className="font-serif text-xl font-semibold text-primary">
                                    Mots-clés en mouvement
                                </h2>
                            </div>

                            <p className="text-xs leading-5 text-secondary">
                                Occurrences dans les titres sur les dernières 24 h comparées aux 24 h précédentes (minimum 2 sources).
                            </p>

                            {data.trends.length === 0 ? (
                                <p className="py-4 text-sm text-secondary">
                                    Pas encore de tendance multisource significative.
                                </p>
                            ) : (
                                <ol className="divide-y divide-[var(--color-border)]">
                                    {data.trends.map((trend) => (
                                        <li key={trend.term} className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <Link
                                                    to={`/?q=${encodeURIComponent(trend.term)}`}
                                                    className="font-semibold text-sm text-primary hover:text-accent hover:underline underline-offset-4 capitalize"
                                                >
                                                    {trend.term}
                                                </Link>
                                                <p className="text-xs text-muted tabular-nums mt-0.5">
                                                    {trend.current} mentions · {trend.sourceCount} sources
                                                </p>
                                            </div>
                                            <span
                                                className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${
                                                    trend.delta > 0
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                                        : 'theme-border surface-muted text-muted'
                                                }`}
                                            >
                                                {trend.delta > 0 ? `+${trend.delta}` : trend.delta}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </aside>
                    </div>
                </>
            )}
        </div>
    );
}
