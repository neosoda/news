import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, Database, Loader2, ShieldAlert } from 'lucide-react';
import { getArticles } from '../services/api';
import BreachCard from '../components/BreachCard';

const BREACH_SOURCES = [
    { name: 'Bonjour la fuite', url: 'https://bonjourlafuite.eu.org/', description: 'Registre communautaire des incidents signalés.' },
    { name: 'Fuites Infos', url: 'https://fuitesinfos.fr/', description: 'Catalogue français des fuites et revendications.' },
    { name: 'FrenchBreaches', url: 'https://frenchbreaches.com/', description: 'Veille indépendante sur les violations de données.' }
];

export default function Breaches({ search }) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['breaches', search],
        queryFn: () => getArticles(1, search, 'Fuites de données'),
        refetchInterval: 10 * 60 * 1000
    });

    const articles = data?.data || [];
    const lastUpdate = articles[0]?.date
        ? new Date(articles[0].date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'En cours de synchronisation';

    return (
        <div className="space-y-8">
            <header className="border-b theme-border pb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-300">
                        <ShieldAlert size={14} aria-hidden="true" />
                        Veille cybersécurité · Incidents
                    </p>
                    <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                        Fuites de données
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary">
                        Alertes françaises centralisées avec leur source, leur date et le contexte publié, séparées du fil général.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:min-w-[340px]">
                    <div className="surface-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Sources suivies</p>
                        <p className="mt-1.5 text-2xl font-bold text-primary tabular-nums">{BREACH_SOURCES.length}</p>
                    </div>
                    <div className="surface-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Dernière alerte</p>
                        <p className="mt-1.5 text-sm font-semibold text-emerald-300">{lastUpdate}</p>
                    </div>
                </div>
            </header>

            <section aria-label="Sources de veille" className="grid gap-4 md:grid-cols-3">
                {BREACH_SOURCES.map((source) => (
                    <a
                        key={source.name}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group surface-card surface-card-interactive p-4"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                                {source.name}
                            </span>
                            <ArrowUpRight size={15} className="text-muted group-hover:text-accent shrink-0" aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-secondary">{source.description}</p>
                    </a>
                ))}
            </section>

            <section aria-label="Dernières alertes">
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-b theme-border pb-3">
                    <h2 className="font-serif text-2xl font-semibold text-primary">Dernières alertes</h2>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted tabular-nums">
                        <Database size={13} aria-hidden="true" />
                        {articles.length} alerte{articles.length > 1 ? 's' : ''} affichée{articles.length > 1 ? 's' : ''}
                    </span>
                </div>

                {isLoading ? (
                    <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 surface-card text-secondary">
                        <Loader2 size={32} className="animate-spin text-accent" aria-hidden="true" />
                        <p className="text-sm">Synchronisation des alertes…</p>
                    </div>
                ) : isError ? (
                    <div role="alert" className="flex items-center gap-3 surface-card border-red-500/30 p-6 text-sm text-red-300">
                        <AlertCircle size={18} aria-hidden="true" />
                        <p>{error?.response?.data?.error || 'Les alertes sont temporairement indisponibles.'}</p>
                    </div>
                ) : articles.length === 0 ? (
                    <div className="surface-card p-10 text-center space-y-2">
                        <ShieldAlert size={30} className="mx-auto text-muted opacity-50" aria-hidden="true" />
                        <h3 className="text-base font-semibold text-primary">
                            Aucune alerte ne correspond à cette recherche
                        </h3>
                        <p className="text-sm text-secondary">
                            Les flux sont synchronisés automatiquement toutes les 15 minutes.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {articles.map((article) => (
                            <BreachCard key={article.id} article={article} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
