import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bookmark, History, Search, Trash2, X } from 'lucide-react';
import { getHistory, clearHistory } from '../services/readerPreferences';
import { getBookmarks, toggleBookmark } from '../services/api';
import { safeHttpUrl, formatDateTime } from '../utils/url';

export default function ReadingHistory() {
    const queryClient = useQueryClient();
    const { data = [] } = useQuery({
        queryKey: ['reader-history'],
        queryFn: getHistory
    });
    const { data: bookmarks = [] } = useQuery({
        queryKey: ['bookmarks'],
        queryFn: getBookmarks
    });

    const [filter, setFilter] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const [storageError, setStorageError] = useState('');

    const rows = data.filter((article) =>
        `${article.title} ${article.source?.name || ''} ${article.category || ''}`
            .toLowerCase()
            .includes(filter.trim().toLowerCase())
    );

    const handleClear = () => {
        try {
            clearHistory();
            queryClient.setQueryData(['reader-history'], []);
            setConfirmClear(false);
            setStorageError('');
        } catch {
            setStorageError('Impossible d’effacer l’historique sur cet appareil.');
        }
    };

    const handleBookmark = async (article) => {
        try {
            const next = await toggleBookmark(article);
            queryClient.setQueryData(['bookmarks'], next);
            setStorageError('');
        } catch {
            setStorageError('Impossible de mettre à jour les favoris sur cet appareil.');
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-7">
            <header className="border-b theme-border pb-6">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    <History size={14} aria-hidden="true" />
                    Stockage local · Privé
                </p>
                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                    Historique de lecture
                </h1>
                <p className="mt-3 text-sm leading-6 text-secondary">
                    Les 100 derniers articles ouverts depuis ce navigateur. Aucune donnée de lecture n’est transmise au serveur.
                </p>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                    <Search
                        size={15}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                        type="search"
                        aria-label="Filtrer l’historique"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Filtrer par titre ou source…"
                        className="theme-input w-full rounded-lg pl-9 pr-8 py-2 text-sm"
                    />
                    {filter && (
                        <button
                            type="button"
                            onClick={() => setFilter('')}
                            aria-label="Effacer le filtre"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>

                {data.length > 0 && !confirmClear && (
                    <button
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="editorial-btn text-xs text-secondary hover:text-red-300"
                    >
                        <Trash2 size={14} aria-hidden="true" />
                        Effacer l’historique
                    </button>
                )}
            </div>

            {confirmClear && (
                <div role="alert" className="surface-card border-red-500/35 p-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-primary font-medium">
                        Effacer définitivement l’historique stocké dans ce navigateur ?
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleClear}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25 transition-colors"
                        >
                            Confirmer l’effacement
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmClear(false)}
                            className="editorial-btn text-xs"
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            )}

            {storageError && (
                <p role="alert" className="text-sm text-red-300">{storageError}</p>
            )}

            {rows.length === 0 ? (
                <div className="surface-card p-10 text-center space-y-3">
                    <History size={32} aria-hidden="true" className="mx-auto text-muted opacity-50" />
                    <p className="text-sm text-secondary">
                        {data.length > 0
                            ? 'Aucun article ne correspond à ce filtre.'
                            : 'Aucun article ouvert pour le moment.'}
                    </p>
                    {data.length === 0 && (
                        <Link to="/" className="editorial-btn inline-flex">
                            Parcourir les actualités
                        </Link>
                    )}
                </div>
            ) : (
                <div className="surface-card divide-y divide-[var(--color-border)] overflow-hidden">
                    {rows.map((article) => {
                        const href = safeHttpUrl(article.link);
                        const isBookmarked = bookmarks.some((item) => item.link === article.link);

                        return (
                            <article key={article.link} className="p-4 sm:p-5 flex items-start justify-between gap-4 hover:bg-[var(--color-surface-muted)] transition-colors">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                        {article.category && (
                                            <span className="rounded border theme-border surface-muted px-1.5 py-0.5 font-semibold text-accent">
                                                {article.category}
                                            </span>
                                        )}
                                        <span className="font-medium text-secondary">
                                            {article.source?.name || 'Source'}
                                        </span>
                                        <span className="tabular-nums">· Ouvert le {formatDateTime(article.openedAt)}</span>
                                    </div>
                                    {href ? (
                                        <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-start gap-1.5 text-base font-semibold leading-snug text-primary hover:text-accent hover:underline underline-offset-4"
                                        >
                                            <span>{article.title}</span>
                                            <ArrowUpRight size={15} aria-hidden="true" className="mt-1 shrink-0 text-muted" />
                                        </a>
                                    ) : (
                                        <p className="text-base font-semibold leading-snug text-primary">{article.title}</p>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    aria-pressed={isBookmarked}
                                    aria-label={isBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                                    onClick={() => handleBookmark(article)}
                                    className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border theme-border text-secondary hover:text-accent hover:border-[var(--color-border-strong)] transition-colors"
                                >
                                    <Bookmark size={15} aria-hidden="true" className={isBookmarked ? 'fill-current text-accent' : ''} />
                                </button>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
