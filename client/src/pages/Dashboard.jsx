import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
    ArrowRight,
    BookmarkPlus,
    ChevronDown,
    Filter,
    Layers,
    Radar,
    RotateCcw,
    SlidersHorizontal,
    X,
    Zap
} from 'lucide-react';
import { getArticles, getArticleStats, getArticleSources, getEditorial } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { getHiddenSources, saveHiddenSources, clearHiddenSources } from '../services/readerPreferences';

const FOLLOWED_KEY = 'newsai-followed-keywords-v1';

const PERIOD_LABELS = {
    '24h': 'Dernières 24 h',
    '7d': '7 derniers jours',
    '30d': '30 derniers jours'
};

function readFollowedKeywords() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(FOLLOWED_KEY) || '[]');
        return Array.isArray(parsed)
            ? parsed.filter((item) => typeof item === 'string' && item.trim()).slice(0, 20)
            : [];
    } catch {
        return [];
    }
}

export default function Dashboard({ search, category, setCategory }) {
    const [params, setParams] = useSearchParams();
    const period = params.get('period') || '';
    const sourceId = params.get('source') || '';

    const [followed, setFollowed] = useState(readFollowedKeywords);
    const [hidden, setHidden] = useState(getHiddenSources);
    const [sourceQuery, setSourceQuery] = useState('');
    const [storageError, setStorageError] = useState(false);

    const { data: stats } = useQuery({
        queryKey: ['article-stats'],
        queryFn: getArticleStats,
        staleTime: 60000
    });

    const { data: sources = [], isError: sourcesError } = useQuery({
        queryKey: ['article-sources'],
        queryFn: getArticleSources,
        staleTime: 300000
    });

    const { data: editorial } = useQuery({
        queryKey: ['editorial'],
        queryFn: getEditorial,
        staleTime: 300000
    });

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status,
        refetch,
        isFetchNextPageError
    } = useInfiniteQuery({
        queryKey: ['articles', search, category, period, sourceId, hidden],
        queryFn: ({ pageParam }) =>
            getArticles(pageParam, search, category, {
                period,
                sourceId,
                excludeSources: hidden
            }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.pagination.page < lastPage.pagination.pages
                ? lastPage.pagination.page + 1
                : undefined
    });

    const categories = Object.keys(stats?.stats || {}).sort(
        (a, b) => stats.stats[b] - stats.stats[a]
    );
    const articles = [
        ...new Map((data?.pages.flatMap((page) => page.data) || []).map((article) => [article.id, article])).values()
    ];
    const total = data?.pages[0]?.pagination.total;
    const selectedSource = sources.find((source) => String(source.id) === String(sourceId));
    const hasActiveFilters = Boolean(search.trim() || category || period || sourceId);

    const filteredSources = sources.filter((source) =>
        source.name.toLowerCase().includes(sourceQuery.trim().toLowerCase())
    );

    const setFilter = (key, value) => {
        setParams(
            (old) => {
                const next = new URLSearchParams(old);
                if (value) next.set(key, value);
                else next.delete(key);
                return next;
            },
            { replace: true }
        );
    };

    const persistFollowed = (next) => {
        try {
            window.localStorage.setItem(FOLLOWED_KEY, JSON.stringify(next));
            setFollowed(next);
            setStorageError(false);
        } catch {
            setStorageError(true);
        }
    };

    const toggleFollow = () => {
        const value = search.trim();
        if (!value) return;
        const next = followed.includes(value)
            ? followed.filter((term) => term !== value)
            : [value, ...followed].slice(0, 20);
        persistFollowed(next);
    };

    const removeFollowed = (term) => {
        persistFollowed(followed.filter((item) => item !== term));
    };

    const resetFilters = () => setParams({}, { replace: true });

    const toggleHiddenSource = (id) => {
        const next = hidden.includes(id)
            ? hidden.filter((item) => item !== id)
            : [...hidden, id].slice(0, 100);
        try {
            saveHiddenSources(next);
            setHidden(next);
            setStorageError(false);
        } catch {
            setStorageError(true);
        }
    };

    const restoreAllSources = () => {
        try {
            clearHiddenSources();
            setHidden([]);
            setStorageError(false);
        } catch {
            setStorageError(true);
        }
    };

    return (
        <div className="space-y-7">
            <header className="border-b theme-border pb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        Salle de veille technologique
                    </p>
                    <h1 className="font-serif text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold leading-tight tracking-tight text-primary mt-2">
                        Tech & IA, au quotidien
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary">
                        Flux consolidés, sources vérifiées et sujets repris par plusieurs rédactions.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <Link to="/daily-brief" className="editorial-btn-primary">
                        <Zap size={15} aria-hidden="true" />
                        Brief IA du jour
                    </Link>
                    <Link to="/cyber" className="editorial-btn">
                        <Radar size={15} aria-hidden="true" />
                        Cyber Radar
                    </Link>
                </div>
            </header>

            <section aria-label="Filtres de recherche" className="news-panel rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        aria-pressed={category === ''}
                        onClick={() => setCategory('')}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                            category === '' ? 'news-chip-active font-semibold' : 'news-chip'
                        }`}
                    >
                        <span>Tout</span>
                        {typeof stats?.total === 'number' && (
                            <span className="rounded px-1.5 py-0.5 text-xs tabular-nums surface-muted text-muted">
                                {stats.total}
                            </span>
                        )}
                    </button>

                    {categories.map((cat) => (
                        <button
                            type="button"
                            key={cat}
                            aria-pressed={category === cat}
                            onClick={() => setCategory(cat)}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                                category === cat ? 'news-chip-active font-semibold' : 'news-chip'
                            }`}
                        >
                            <span>{cat}</span>
                            {typeof stats?.stats?.[cat] === 'number' && (
                                <span className="rounded px-1.5 py-0.5 text-xs tabular-nums surface-muted text-muted">
                                    {stats.stats[cat]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="pt-3 border-t theme-border flex flex-wrap items-end gap-3">
                    <label className="text-xs font-medium text-secondary">
                        Période
                        <select
                            className="block mt-1 theme-input rounded-lg px-3 py-2 text-sm min-w-[10.5rem]"
                            value={period}
                            onChange={(event) => setFilter('period', event.target.value)}
                        >
                            <option value="">Toutes les dates</option>
                            <option value="24h">24 heures</option>
                            <option value="7d">7 jours</option>
                            <option value="30d">30 jours</option>
                        </select>
                    </label>

                    <label className="text-xs font-medium text-secondary min-w-0 max-w-full">
                        Source
                        <select
                            className="block mt-1 theme-input rounded-lg px-3 py-2 text-sm min-w-[12rem] max-w-full"
                            value={sourceId}
                            onChange={(event) => setFilter('source', event.target.value)}
                        >
                            <option value="">Toutes les sources</option>
                            {sources.map((source) => (
                                <option key={source.id} value={source.id}>
                                    {source.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    {search.trim() && (
                        <button
                            type="button"
                            onClick={toggleFollow}
                            aria-pressed={followed.includes(search.trim())}
                            className={`editorial-btn py-2 text-xs ${
                                followed.includes(search.trim()) ? 'news-chip-active' : ''
                            }`}
                        >
                            <BookmarkPlus size={14} aria-hidden="true" />
                            {followed.includes(search.trim()) ? 'Recherche suivie' : 'Suivre cette recherche'}
                        </button>
                    )}

                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-secondary hover:text-primary hover:bg-[var(--color-surface-muted)] transition-colors"
                        >
                            <RotateCcw size={13} aria-hidden="true" />
                            Réinitialiser
                        </button>
                    )}
                </div>

                {hasActiveFilters && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 text-muted font-medium">
                            <Filter size={12} aria-hidden="true" />
                            Filtres actifs :
                        </span>
                        {search.trim() && (
                            <span className="inline-flex items-center gap-1 rounded-md border theme-border surface-muted px-2 py-1 text-secondary">
                                Recherche « {search.trim()} »
                                <button type="button" onClick={() => setFilter('q', '')} aria-label="Retirer la recherche" className="hover:text-primary">
                                    <X size={12} aria-hidden="true" />
                                </button>
                            </span>
                        )}
                        {category && (
                            <span className="inline-flex items-center gap-1 rounded-md border theme-border surface-muted px-2 py-1 text-secondary">
                                {category}
                                <button type="button" onClick={() => setCategory('')} aria-label="Retirer la catégorie" className="hover:text-primary">
                                    <X size={12} aria-hidden="true" />
                                </button>
                            </span>
                        )}
                        {period && (
                            <span className="inline-flex items-center gap-1 rounded-md border theme-border surface-muted px-2 py-1 text-secondary">
                                {PERIOD_LABELS[period] || period}
                                <button type="button" onClick={() => setFilter('period', '')} aria-label="Retirer la période" className="hover:text-primary">
                                    <X size={12} aria-hidden="true" />
                                </button>
                            </span>
                        )}
                        {selectedSource && (
                            <span className="inline-flex items-center gap-1 rounded-md border theme-border surface-muted px-2 py-1 text-secondary">
                                {selectedSource.name}
                                <button type="button" onClick={() => setFilter('source', '')} aria-label="Retirer la source" className="hover:text-primary">
                                    <X size={12} aria-hidden="true" />
                                </button>
                            </span>
                        )}
                    </div>
                )}

                {followed.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs font-medium text-muted">Recherches suivies :</span>
                        {followed.map((term) => (
                            <span
                                key={term}
                                className="inline-flex items-center rounded-md border theme-border surface-muted text-xs text-secondary overflow-hidden"
                            >
                                <button
                                    type="button"
                                    onClick={() => setFilter('q', term)}
                                    className="px-2.5 py-1 hover:text-primary transition-colors"
                                >
                                    {term}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeFollowed(term)}
                                    aria-label={`Ne plus suivre ${term}`}
                                    className="px-1.5 py-1 border-l theme-border text-muted hover:text-primary transition-colors"
                                >
                                    <X size={12} aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <details className="group pt-1 text-sm text-secondary">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-secondary hover:text-primary transition-colors">
                        <SlidersHorizontal size={13} aria-hidden="true" className="text-muted" />
                        <span>Personnaliser les sources ({hidden.length} masquée{hidden.length > 1 ? 's' : ''})</span>
                        <ChevronDown size={14} aria-hidden="true" className="text-muted transition-transform group-open:rotate-180" />
                    </summary>

                    <div className="mt-3 rounded-lg border theme-border surface-muted p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <input
                                type="search"
                                value={sourceQuery}
                                onChange={(event) => setSourceQuery(event.target.value)}
                                aria-label="Filtrer la liste des sources"
                                placeholder="Filtrer les sources…"
                                className="theme-input rounded-lg px-3 py-1.5 text-xs w-full sm:w-64"
                            />
                            {hidden.length > 0 && (
                                <button
                                    type="button"
                                    onClick={restoreAllSources}
                                    className="text-xs font-semibold text-accent hover:underline"
                                >
                                    Tout réafficher
                                </button>
                            )}
                        </div>

                        <div className="max-h-52 overflow-y-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {filteredSources.map((source) => (
                                <label
                                    key={source.id}
                                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-secondary hover:bg-[var(--color-surface-raised)] cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={!hidden.includes(source.id)}
                                        onChange={() => toggleHiddenSource(source.id)}
                                        className="rounded"
                                    />
                                    <span className="truncate">{source.name}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-muted">
                            Les sources masquées restent consultables en les sélectionnant explicitement dans le filtre Source.
                        </p>
                    </div>
                </details>

                {sourcesError && (
                    <p role="status" className="text-xs text-secondary">
                        Liste des sources indisponible.
                    </p>
                )}
                {storageError && (
                    <p role="alert" className="text-xs text-red-300">
                        Impossible d’enregistrer vos préférences dans ce navigateur.
                    </p>
                )}
            </section>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-8 items-start">
                <section aria-label="Actualités" className="min-w-0">
                    <div className="flex items-baseline justify-between border-b theme-border pb-3 mb-5">
                        <h2 className="font-serif text-2xl font-semibold text-primary">
                            Dernières publications
                        </h2>
                        {typeof total === 'number' && (
                            <span className="text-xs font-medium text-muted tabular-nums">
                                {total} article{total > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {status === 'pending' ? (
                        <div role="status" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                                <div key={index} className="surface-card overflow-hidden animate-pulse">
                                    <div className="aspect-[16/9] surface-muted" />
                                    <div className="p-5 space-y-3">
                                        <div className="h-3 w-24 rounded surface-muted" />
                                        <div className="h-5 w-full rounded surface-muted" />
                                        <div className="h-5 w-4/5 rounded surface-muted" />
                                        <div className="h-3 w-2/3 rounded surface-muted" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : status === 'error' && articles.length === 0 ? (
                        <div role="alert" className="surface-card p-8 text-center space-y-3">
                            <p className="text-sm font-medium text-secondary">
                                Les actualités sont momentanément indisponibles.
                            </p>
                            <button type="button" onClick={() => refetch()} className="editorial-btn">
                                Réessayer
                            </button>
                        </div>
                    ) : (
                        <>
                            {articles.length === 0 && (
                                <div className="surface-card p-10 text-center space-y-3">
                                    <p className="text-sm text-secondary">
                                        Aucun article ne correspond aux filtres sélectionnés.
                                    </p>
                                    {hasActiveFilters && (
                                        <button type="button" onClick={resetFilters} className="editorial-btn">
                                            Afficher toutes les actualités
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
                                {articles.map((article) => (
                                    <ArticleCard key={article.id} article={article} />
                                ))}
                            </div>

                            {hasNextPage && (
                                <div className="flex justify-center py-8">
                                    <button
                                        type="button"
                                        disabled={isFetchingNextPage}
                                        onClick={() => fetchNextPage()}
                                        className="editorial-btn px-6 py-2.5"
                                    >
                                        {isFetchingNextPage
                                            ? 'Chargement…'
                                            : isFetchNextPageError
                                                ? 'Réessayer le chargement'
                                                : 'Charger plus d’articles'}
                                    </button>
                                </div>
                            )}

                            {!hasNextPage && articles.length > 0 && (
                                <p className="text-center text-xs font-medium text-muted py-8">
                                    Fin des résultats
                                </p>
                            )}
                        </>
                    )}
                </section>

                <aside aria-label="À la une des sources" className="surface-card p-5 space-y-5 xl:sticky xl:top-6">
                    <div className="flex items-center justify-between border-b theme-border pb-3">
                        <div className="flex items-center gap-2">
                            <Layers size={16} aria-hidden="true" className="text-accent" />
                            <h2 className="font-serif text-xl font-semibold text-primary">
                                À la une des sources
                            </h2>
                        </div>
                    </div>

                    {editorial?.topics?.length > 0 ? (
                        <div className="divide-y divide-[var(--color-border)]">
                            {editorial.topics.slice(0, 5).map((topic) => (
                                <article key={topic.id} className="py-3.5 first:pt-0 last:pb-0">
                                    <p className="text-[11px] font-semibold text-accent">
                                        {topic.sourceCount} sources · {topic.category}
                                    </p>
                                    <h3 className="mt-1 text-sm font-semibold leading-snug text-primary">
                                        <Link
                                            to={`/editorial#dossier-${topic.id}`}
                                            className="hover:text-accent hover:underline underline-offset-4 transition-colors"
                                        >
                                            {topic.title}
                                        </Link>
                                    </h3>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs leading-5 text-secondary">
                            Les dossiers apparaissent automatiquement lorsque plusieurs médias couvrent le même sujet sur 48 h.
                        </p>
                    )}

                    <div className="pt-3 border-t theme-border space-y-2">
                        <Link
                            to="/editorial"
                            className="flex items-center justify-between text-xs font-semibold text-accent hover:underline"
                        >
                            <span>Tous les dossiers et tendances</span>
                            <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                        <Link
                            to="/cyber"
                            className="flex items-center justify-between text-xs font-semibold text-secondary hover:text-primary hover:underline"
                        >
                            <span>Ouvrir le Cyber Radar</span>
                            <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                    </div>
                </aside>
            </div>
        </div>
    );
}
