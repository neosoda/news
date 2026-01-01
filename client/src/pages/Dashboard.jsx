import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { getArticles } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { Loader2, TrendingUp } from 'lucide-react';

export default function Dashboard({ search }) {
    const { ref, inView } = useInView();

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status
    } = useInfiniteQuery({
        queryKey: ['articles', search],
        queryFn: ({ pageParam = 1 }) => getArticles(pageParam, search),
        getNextPageParam: (lastPage) => {
            return lastPage.pagination.page < lastPage.pagination.pages ? lastPage.pagination.page + 1 : undefined;
        }
    });

    React.useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, fetchNextPage, hasNextPage]);

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 space-y-4 sm:space-y-0">
                <div>
                    <div className="flex items-center space-x-2 text-blue-500 font-black uppercase tracking-[0.3em] text-[10px] mb-2">
                        <TrendingUp size={14} />
                        <span>Tendances</span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tighter">
                        Actualités <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-500 truncate inline-block">Tech & IA</span>
                    </h1>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 flex items-center space-x-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total</span>
                    <span className="text-xl font-black text-white">{data?.pages[0]?.pagination.total || 0}</span>
                </div>
            </div>

            {status === 'pending' ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                    <Loader2 className="animate-spin text-blue-500" size={48} />
                    <p className="text-gray-400 font-medium animate-pulse">Chargement de la veille...</p>
                </div>
            ) : status === 'error' ? (
                <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl text-red-500 font-bold flex items-center justify-center">
                    Une erreur est survenue lors de la récupération des articles.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
                        {data.pages.map((page) =>
                            page.data.map((article) => (
                                <ArticleCard key={article.id} article={article} />
                            ))
                        )}
                    </div>

                    <div ref={ref} className="flex justify-center py-16">
                        {isFetchingNextPage ? (
                            <Loader2 className="animate-spin text-blue-500" size={32} />
                        ) : hasNextPage ? (
                            <div className="w-16 h-1 bg-white/5 rounded-full" />
                        ) : (
                            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Fin de la veille</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
