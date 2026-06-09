import React from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { getArticles, getArticleStats } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { Loader2, TrendingUp, Filter, Newspaper, Layers3 } from 'lucide-react';

export default function Dashboard({ search, category, setCategory }) {
    const { ref, inView } = useInView();

    const { data: stats } = useQuery({
        queryKey: ['article-stats'],
        queryFn: getArticleStats,
        refetchInterval: 60000
    });

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status
    } = useInfiniteQuery({
        queryKey: ['articles', search, category],
        queryFn: ({ pageParam = 1 }) => getArticles(pageParam, search, category),
        getNextPageParam: (lastPage) => {
            return lastPage.pagination.page < lastPage.pagination.pages
                ? lastPage.pagination.page + 1
                : undefined;
        }
    });

    const availableCategories = React.useMemo(() => {
        const statsByCategory = stats?.stats || {};
        return Object.keys(statsByCategory).sort(
            (a, b) => (statsByCategory[b] || 0) - (statsByCategory[a] || 0)
        );
    }, [stats]);

    React.useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, fetchNextPage, hasNextPage]);

    const totalArticles = data?.pages[0]?.pagination.total || 0;

    return (
        <div className="space-y-7">
            <section className="news-panel rounded-xl p-5 lg:p-6">
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center space-x-2 text-cyan-300 font-black uppercase tracking-[0.28em] text-[10px] mb-3">
                            <TrendingUp size={14} />
                            <span>Tendances</span>
                        </div>
                        <h1 className="text-3xl sm:text-5xl font-black text-primary tracking-tight">
                            Actualites <span className="text-cyan-200">Tech & IA</span>
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary">
                            Une vue compacte pour scanner les signaux importants, filtrer vite et garder le fil de la veille.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 min-w-full xl:min-w-[420px]">
                        <div className="rounded-xl border theme-border surface-muted p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Articles</p>
                            <p className="mt-2 text-2xl font-black text-primary">{totalArticles}</p>
                        </div>
                        <div className="rounded-xl border theme-border surface-muted p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Catégories</p>
                            <p className="mt-2 text-2xl font-black text-primary">{availableCategories.length}</p>
                        </div>
                        <div className="rounded-xl border theme-border surface-muted p-4 col-span-2 sm:col-span-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Vue</p>
                            <p className="mt-2 text-sm font-bold text-emerald-300">Flux quotidien</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="news-panel rounded-xl p-4 lg:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center space-x-2">
                        <Filter size={16} className="text-muted" />
                        <span className="text-xs font-bold text-secondary uppercase tracking-[0.18em]">Filtrer par categorie</span>
                    </div>
                    <div className="hidden sm:flex items-center space-x-2 text-xs text-muted">
                        <Layers3 size={14} />
                        <span>{category || 'Toutes les catégories'}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                    <button
                        onClick={() => setCategory('')}
                        className={`px-3.5 py-2 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center space-x-2 border ${category === ''
                                ? 'bg-cyan-400/[0.12] text-cyan-100 border-cyan-300/30 shadow-lg shadow-cyan-500/10'
                                : 'news-chip'
                            }`}
                    >
                        <Newspaper size={15} />
                        <span>Toutes</span>
                        {stats && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${category === '' ? 'bg-cyan-400/15' : 'surface-muted'
                                }`}>
                                {stats.total}
                            </span>
                        )}
                    </button>
                    {availableCategories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={`px-3.5 py-2 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center space-x-2 border ${category === cat
                                    ? 'bg-cyan-400/[0.12] text-cyan-100 border-cyan-300/30 shadow-lg shadow-cyan-500/10'
                                    : 'news-chip'
                                }`}
                        >
                            <span>{cat}</span>
                            {stats && stats.stats[cat] !== undefined && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${category === cat ? 'bg-cyan-400/15' : 'surface-muted'
                                    }`}>
                                    {stats.stats[cat]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </section>

            {status === 'pending' ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                    <Loader2 className="animate-spin text-cyan-300" size={48} />
                    <p className="text-secondary font-medium animate-pulse">Chargement de la veille...</p>
                </div>
            ) : status === 'error' ? (
                <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl text-red-300 font-bold flex items-center justify-center">
                    Une erreur est survenue lors de la recuperation des articles.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                        {data.pages.map((page) =>
                            page.data.map((article) => (
                                <ArticleCard key={article.id} article={article} />
                            ))
                        )}
                    </div>

                    <div ref={ref} className="flex justify-center py-14">
                        {isFetchingNextPage ? (
                            <Loader2 className="animate-spin text-cyan-300" size={32} />
                        ) : hasNextPage ? (
                            <div className="w-16 h-1 surface-muted rounded-full" />
                        ) : (
                            <p className="text-muted font-bold uppercase tracking-widest text-xs">Fin de la veille</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
