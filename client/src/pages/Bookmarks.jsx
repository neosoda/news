import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bookmark, Loader2, Search, X } from 'lucide-react';
import { getBookmarks } from '../services/api';
import ArticleCard from '../components/ArticleCard';

export default function Bookmarks() {
    const [filter, setFilter] = useState('');

    const { data: articles = [], isLoading, isError } = useQuery({
        queryKey: ['bookmarks'],
        queryFn: getBookmarks
    });

    const query = filter.trim().toLowerCase();
    const filteredArticles = articles.filter(
        (article) =>
            !query ||
            article.title?.toLowerCase().includes(query) ||
            article.content?.toLowerCase().includes(query) ||
            article.source?.name?.toLowerCase().includes(query)
    );

    return (
        <div className="space-y-7">
            <header className="border-b theme-border pb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        <Bookmark size={14} aria-hidden="true" className="fill-current" />
                        Lecture différée · Stockage local
                    </p>
                    <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                        Mes favoris
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-secondary">
                        Enregistrés dans ce navigateur, même après la disparition de l’article du fil principal.
                    </p>
                </div>

                <div className="relative w-full sm:w-72 shrink-0">
                    <Search
                        size={15}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                        type="search"
                        aria-label="Filtrer mes favoris"
                        placeholder="Filtrer mes favoris…"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        className="theme-input rounded-lg pl-9 pr-8 py-2 text-sm w-full"
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
            </header>

            {isLoading ? (
                <div role="status" className="flex flex-col items-center justify-center min-h-[320px] space-y-3">
                    <Loader2 className="animate-spin text-accent" size={32} aria-hidden="true" />
                    <p className="text-sm text-secondary">Chargement des favoris…</p>
                </div>
            ) : isError ? (
                <div role="alert" className="surface-card border-red-500/30 p-6 text-center text-sm text-red-300">
                    Impossible de charger vos favoris.
                </div>
            ) : filteredArticles.length === 0 ? (
                <div className="surface-card p-12 text-center space-y-3">
                    <Bookmark size={36} aria-hidden="true" className="mx-auto text-muted opacity-40" />
                    <p className="text-sm font-medium text-secondary">
                        {articles.length > 0
                            ? 'Aucun favori ne correspond à cette recherche.'
                            : 'Aucun article enregistré dans vos favoris.'}
                    </p>
                    {articles.length === 0 && (
                        <Link to="/" className="editorial-btn inline-flex">
                            Parcourir les actualités
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted tabular-nums">
                        {filteredArticles.length} favori{filteredArticles.length > 1 ? 's' : ''}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                        {filteredArticles.map((article) => (
                            <ArticleCard key={article.link || article.id} article={article} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
