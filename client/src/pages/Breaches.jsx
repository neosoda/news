import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Database, Loader2, Radar, Rss, ShieldAlert } from 'lucide-react';
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
        : 'en cours de synchronisation';

    return (
        <div className="space-y-7">
            <section className="news-panel relative overflow-hidden rounded-2xl p-5 lg:p-7">
                <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" aria-hidden="true" />
                <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
                <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.26em] text-red-300">
                            <Radar size={14} aria-hidden="true" />
                            Veille cybersécurité
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-primary sm:text-5xl">Fuites de <span className="text-cyan-200">données</span></h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary">
                            Les alertes françaises centralisées au même endroit, avec leur source, leur date et le contexte disponible.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
                        <div className="rounded-xl border theme-border surface-muted p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Sources suivies</p>
                            <p className="mt-2 flex items-center gap-2 text-2xl font-black text-primary"><Rss size={20} className="text-cyan-200" />3</p>
                        </div>
                        <div className="rounded-xl border theme-border surface-muted p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Dernière alerte</p>
                            <p className="mt-2 text-sm font-bold text-emerald-300">{lastUpdate}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section aria-label="Sources de veille" className="grid gap-3 md:grid-cols-3">
                {BREACH_SOURCES.map((source) => (
                    <a key={source.name} href={source.url} target="_blank" rel="noopener noreferrer" className="group rounded-xl border theme-border surface-card p-4 transition-all hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-400/[0.05] focus:outline-none focus:ring-2 focus:ring-cyan-300/50">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-black text-primary group-hover:text-accent">{source.name}</span>
                            <Rss size={16} className="text-muted group-hover:text-cyan-200" aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted">{source.description}</p>
                    </a>
                ))}
            </section>

            <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-red-300" aria-hidden="true" />
                        <h2 className="text-base font-black text-primary">Dernières alertes</h2>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-muted"><Database size={14} aria-hidden="true" />{articles.length} alerte{articles.length > 1 ? 's' : ''} affichée{articles.length > 1 ? 's' : ''}</span>
                </div>

                {isLoading ? (
                    <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border theme-border surface-card text-secondary">
                        <Loader2 size={38} className="animate-spin text-cyan-200" />
                        <p>Synchronisation des alertes…</p>
                    </div>
                ) : isError ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/[0.08] p-6 text-red-200">
                        <AlertCircle size={20} aria-hidden="true" />
                        <p>{error?.response?.data?.error || 'Les alertes sont temporairement indisponibles.'}</p>
                    </div>
                ) : articles.length === 0 ? (
                    <div className="rounded-2xl border theme-border surface-card p-10 text-center">
                        <ShieldAlert size={34} className="mx-auto text-muted" aria-hidden="true" />
                        <h2 className="mt-4 text-lg font-black text-primary">Aucune alerte ne correspond à cette recherche</h2>
                        <p className="mt-2 text-sm text-secondary">Les flux sont synchronisés automatiquement toutes les 30 minutes.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {articles.map((article) => <BreachCard key={article.id} article={article} />)}
                    </div>
                )}
            </section>
        </div>
    );
}
