import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Bot, Sparkles, Bookmark } from 'lucide-react';
import { summarizeArticle, toggleBookmark } from '../services/api';

const CATEGORY_COLORS = {
    'Cybersecurité': 'bg-red-500/20 text-red-400 border-red-500/30',
    'Intelligence Artificielle': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'Cloud': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    'Développement': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'Hardware': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'Web': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Business': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'Société': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'Autre': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const KNOWN_CATEGORIES = Object.keys(CATEGORY_COLORS);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCategory(category) {
    if (!category || typeof category !== 'string') {
        return 'Autre';
    }

    const trimmed = category.trim();
    if (!trimmed) return 'Autre';

    const exactMatch = KNOWN_CATEGORIES.find(
        (known) => known.toLowerCase() === trimmed.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    const matchedCategory = KNOWN_CATEGORIES.find((known) =>
        new RegExp(`\\b${escapeRegExp(known)}\\b`, 'i').test(trimmed)
    );

    return matchedCategory || 'Autre';
}

export default function ArticleCard({ article }) {
    const [summary, setSummary] = useState(article.summary);
    const [isBookmarked, setIsBookmarked] = useState(article.isBookmarked);
    const [loading, setLoading] = useState(false);

    const handleSummarize = async () => {
        setLoading(true);
        try {
            const data = await summarizeArticle(article.id);
            setSummary(data.summary);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleBookmark = async () => {
        const newState = !isBookmarked;
        setIsBookmarked(newState); // Optimistic update
        try {
            await toggleBookmark(article.id);
        } catch (e) {
            console.error(e);
            setIsBookmarked(!newState); // Revert on error
        }
    };

    const resolvedCategory = normalizeCategory(article.category);
    const categoryStyle = CATEGORY_COLORS[resolvedCategory] || CATEGORY_COLORS['Autre'];

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col group relative">
            {/* Category Badge */}
            <div className={`absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-md ${categoryStyle}`}>
                {resolvedCategory || 'News'}
            </div>

            <button
                onClick={handleBookmark}
                className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white border border-white/10 transition-colors"
                title={isBookmarked ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
                <Bookmark size={16} className={isBookmarked ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
            </button>

            {article.image && (
                <div className="relative h-48 overflow-hidden">
                    <img
                        src={article.image}
                        alt={article.title}
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-xs text-white font-medium flex items-center space-x-2">
                        {article.source?.image && (
                            <img src={article.source.image} alt="" className="w-4 h-4 rounded-sm object-contain" />
                        )}
                        <span>{article.source?.name}</span>
                    </div>
                </div>
            )}

            <div className="p-5 flex-1 flex flex-col">
                {!article.image && (
                    <div className="text-xs font-semibold text-blue-400 mb-2 flex items-center space-x-2">
                        {article.source?.image && (
                            <img src={article.source.image} alt="" className="w-4 h-4 rounded-sm object-contain" />
                        )}
                        <span>{article.source?.name}</span>
                    </div>
                )}
                <h3 className="text-lg font-bold text-gray-100 leading-tight mb-2 group-hover:text-blue-400 transition-colors">
                    <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {article.title}
                    </a>
                </h3>

                <div className="text-xs text-gray-400 mb-4 flex flex-col space-y-1">
                    <span className="font-medium text-gray-500">
                        {new Date(article.date).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                    <span className="text-blue-400/80 italic">
                        {formatDistanceToNow(new Date(article.date), { addSuffix: true })}
                    </span>
                </div>

                {summary ? (
                    <div className="mt-auto bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                        <div className="flex items-center space-x-2 mb-1 text-purple-400 text-xs font-bold uppercase tracking-wider">
                            <Sparkles size={12} />
                            <span>AI Summary</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed animate-in fade-in">{summary}</p>
                    </div>
                ) : (
                    article.content ? (
                        <p className="text-sm text-gray-400 line-clamp-3 mb-4">{article.content.replace(/<[^>]+>/g, '')}</p>
                    ) : null
                )}

                <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-between">
                    {!summary && (
                        <button
                            onClick={handleSummarize}
                            disabled={loading}
                            className="flex items-center space-x-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Bot size={16} className={loading ? "animate-spin" : ""} />
                            <span>{loading ? 'Analyzing...' : 'Summarize'}</span>
                        </button>
                    )}

                    <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-gray-400 hover:text-blue-400 transition-colors"
                    >
                        <ExternalLink size={18} />
                    </a>
                </div>
            </div>
        </div>
    );
}
