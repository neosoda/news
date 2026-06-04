import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBookmarks } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { Loader2, Bookmark, Search } from 'lucide-react';

export default function Bookmarks() {
    const [filter, setFilter] = useState('');

    const { data: articles, isLoading, isError } = useQuery({
        queryKey: ['bookmarks'],
        queryFn: getBookmarks
    });

    const filteredArticles = articles?.filter(a =>
        a.title.toLowerCase().includes(filter.toLowerCase()) ||
        a.content?.toLowerCase().includes(filter.toLowerCase())
    ) || [];

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 space-y-4 sm:space-y-0">
                <div>
                    <div className="flex items-center space-x-2 text-yellow-500 font-black uppercase tracking-[0.3em] text-[10px] mb-2">
                        <Bookmark size={14} className="fill-yellow-500" />
                        <span>Lecture différée</span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tighter">
                        Mes <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 truncate inline-block">Favoris</span>
                    </h1>
                </div>

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                        type="text"
                        placeholder="Filtrer mes favoris..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500/50 focus:outline-none w-full sm:w-64"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                    <Loader2 className="animate-spin text-yellow-500" size={48} />
                    <p className="text-gray-400 font-medium animate-pulse">Chargement de vos trésors...</p>
                </div>
            ) : isError ? (
                <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl text-red-500 font-bold flex items-center justify-center">
                    Impossible de charger les favoris via le flux neural.
                </div>
            ) : filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500 space-y-4">
                    <Bookmark size={48} className="opacity-20" />
                    <p className="font-medium">Aucun article dans les favoris.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
                    {filteredArticles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                    ))}
                </div>
            )}
        </div>
    );
}
