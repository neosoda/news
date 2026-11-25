import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { getSourceObservatory } from '../services/api';
import { formatDateTime } from '../utils/url';

const STATUS_FILTERS = [
    { id: 'all', label: 'Toutes' },
    { id: 'active', label: 'Actives' },
    { id: 'cooling', label: 'En pause' },
    { id: 'degraded', label: 'En difficulté' },
    { id: 'disabled', label: 'Désactivées' }
];

function getSourceStatus(source) {
    if (!source.isActive) {
        return { id: 'disabled', label: 'Désactivée', className: 'border-red-500/30 bg-red-500/10 text-red-300' };
    }
    if (source.isCoolingDown) {
        return { id: 'cooling', label: 'En pause', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' };
    }
    if (source.consecutiveFailures > 0) {
        return { id: 'degraded', label: 'En difficulté', className: 'border-orange-500/30 bg-orange-500/10 text-orange-200' };
    }
    return { id: 'active', label: 'Active', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' };
}

export default function SourceObservatory() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const { data = [], isPending, isError, refetch } = useQuery({
        queryKey: ['source-observatory'],
        queryFn: getSourceObservatory,
        staleTime: 300000
    });

    const summary = useMemo(() => {
        const counts = { total: data.length, active: 0, cooling: 0, degraded: 0, disabled: 0, articles7d: 0 };
        for (const source of data) {
            counts.articles7d += source.articles7d || 0;
            const status = getSourceStatus(source).id;
            counts[status] += 1;
        }
        return counts;
    }, [data]);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return data.filter((source) => {
            if (statusFilter !== 'all' && getSourceStatus(source).id !== statusFilter) {
                return false;
            }
            if (!query) return true;
            return `${source.name} ${source.category}`.toLowerCase().includes(query);
        });
    }, [data, search, statusFilter]);

    return (
        <div className="mx-auto max-w-6xl space-y-8">
            <header className="border-b theme-border pb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        <Activity size={14} aria-hidden="true" />
                        Transparence de la collecte
                    </p>
                    <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                        Observatoire des sources
                    </h1>
                    <p className="mt-3 text-sm leading-6 text-secondary max-w-3xl">
                        Activité des flux RSS et volume d’articles collectés sur les sept derniers jours.
                        Ces indicateurs techniques ne mesurent pas la qualité éditoriale des médias.
                    </p>
                </div>

                <Link to="/sources" className="editorial-btn shrink-0">
                    <SlidersHorizontal size={14} aria-hidden="true" />
                    Administration
                </Link>
            </header>

            {!isPending && !isError && (
                <section aria-label="Synthèse de la collecte" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="surface-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Sources suivies</p>
                        <p className="mt-1.5 text-2xl font-bold text-primary tabular-nums">{summary.total}</p>
                    </div>
                    <div className="surface-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Actives</p>
                        <p className="mt-1.5 text-2xl font-bold text-emerald-300 tabular-nums">{summary.active}</p>
                    </div>
                    <div className="surface-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">En pause / difficulté</p>
                        <p className="mt-1.5 text-2xl font-bold text-amber-300 tabular-nums">
                            {summary.cooling + summary.degraded}
                        </p>
                    </div>
                    <div className="surface-card p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Articles / 7 j</p>
                        <p className="mt-1.5 text-2xl font-bold text-accent tabular-nums">{summary.articles7d}</p>
                    </div>
                </section>
            )}

            <section aria-label="Filtres de l’observatoire" className="news-panel rounded-xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:w-72">
                    <Search
                        size={15}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                        type="search"
                        aria-label="Filtrer les sources"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Filtrer par nom ou catégorie…"
                        className="theme-input w-full rounded-lg pl-9 pr-8 py-2 text-sm"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            aria-label="Effacer le filtre"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.id}
                            type="button"
                            aria-pressed={statusFilter === filter.id}
                            onClick={() => setStatusFilter(filter.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                                statusFilter === filter.id ? 'news-chip-active' : 'news-chip'
                            }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </section>

            {isPending ? (
                <div role="status" className="surface-card p-10 text-center text-sm text-secondary">
                    Chargement de l’observatoire…
                </div>
            ) : isError ? (
                <div role="alert" className="surface-card p-8 text-center space-y-3">
                    <p className="text-sm text-secondary">L’observatoire des sources est momentanément indisponible.</p>
                    <button type="button" onClick={() => refetch()} className="editorial-btn">
                        <RefreshCw size={14} aria-hidden="true" />
                        Réessayer
                    </button>
                </div>
            ) : rows.length === 0 ? (
                <div className="surface-card p-10 text-center text-sm text-secondary">
                    Aucune source ne correspond à ces critères.
                </div>
            ) : (
                <div className="surface-card overflow-hidden">
                    <div className="px-4 py-3 border-b theme-border text-xs text-muted tabular-nums">
                        {rows.length} source{rows.length > 1 ? 's' : ''} affichée{rows.length > 1 ? 's' : ''}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="surface-muted border-b theme-border text-xs font-semibold uppercase tracking-wider text-muted">
                                <tr>
                                    <th scope="col" className="px-4 py-3">Source</th>
                                    <th scope="col" className="px-4 py-3">État</th>
                                    <th scope="col" className="px-4 py-3">Articles / 7 j</th>
                                    <th scope="col" className="px-4 py-3">Dernier article</th>
                                    <th scope="col" className="px-4 py-3">Dernière collecte</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {rows.map((source) => {
                                    const status = getSourceStatus(source);
                                    const targetUrl =
                                        source.category === 'Fuites de données'
                                            ? '/breaches'
                                            : `/?source=${source.id}`;

                                    return (
                                        <tr key={source.id} className="hover:bg-[var(--color-surface-muted)] transition-colors">
                                            <th scope="row" className="px-4 py-3.5 font-medium text-primary">
                                                <Link
                                                    to={targetUrl}
                                                    className="hover:text-accent hover:underline underline-offset-4"
                                                >
                                                    {source.name}
                                                </Link>
                                                <span className="block text-xs font-normal text-muted mt-0.5">
                                                    {source.category}
                                                </span>
                                            </th>
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${status.className}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 font-mono text-sm tabular-nums text-primary">
                                                {source.articles7d}
                                            </td>
                                            <td className="px-4 py-3.5 whitespace-nowrap text-xs text-secondary tabular-nums">
                                                {formatDateTime(source.lastArticle)}
                                            </td>
                                            <td className="px-4 py-3.5 whitespace-nowrap text-xs text-secondary tabular-nums">
                                                {formatDateTime(source.lastFetched)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
