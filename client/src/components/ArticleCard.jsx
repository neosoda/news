import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Bot, Sparkles, Bookmark } from 'lucide-react';
import { summarizeArticle, toggleBookmark } from '../services/api';

const CATEGORY_COLORS = {
    'Cybersecurité': 'bg-red-500/[0.15] text-red-300 border-red-400/25',
    'Intelligence Artificielle': 'bg-fuchsia-500/[0.12] text-fuchsia-200 border-fuchsia-300/25',
    'Cloud': 'bg-sky-500/[0.14] text-sky-200 border-sky-300/25',
    'Développement': 'bg-emerald-500/[0.14] text-emerald-200 border-emerald-300/25',
    'Hardware': 'bg-orange-500/[0.14] text-orange-200 border-orange-300/25',
    'Web': 'bg-blue-500/[0.14] text-blue-200 border-blue-300/25',
    'Business': 'bg-amber-500/[0.14] text-amber-200 border-amber-300/25',
    'Société': 'bg-pink-500/[0.14] text-pink-200 border-pink-300/25',
    'Autre': 'bg-slate-500/[0.14] text-slate-300 border-slate-400/20',
};

const FEATURED_SOURCES = {
    'korben': {
        border: 'border-cyan-300/35',
        shadow: '0 0 0 1px rgba(34, 211, 238, 0.18), 0 18px 44px rgba(8, 145, 178, 0.14)',
        label: 'text-cyan-200',
        badge: 'bg-cyan-400/10 text-cyan-200 border-cyan-300/25',
    },
    'it connect': {
        border: 'border-emerald-300/35',
        shadow: '0 0 0 1px rgba(52, 211, 153, 0.18), 0 18px 44px rgba(5, 150, 105, 0.14)',
        label: 'text-emerald-200',
        badge: 'bg-emerald-400/10 text-emerald-200 border-emerald-300/25',
    },
};

function getFeaturedSource(sourceName) {
    if (!sourceName) return null;
    const lower = sourceName.toLowerCase();
    for (const key of Object.keys(FEATURED_SOURCES)) {
        if (lower.includes(key)) return FEATURED_SOURCES[key];
    }
    return null;
}

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
        setIsBookmarked(newState);
        try {
            await toggleBookmark(article.id);
        } catch (e) {
            console.error(e);
            setIsBookmarked(!newState);
        }
    };

    const resolvedCategory = normalizeCategory(article.category);
    const categoryStyle = CATEGORY_COLORS[resolvedCategory] || CATEGORY_COLORS['Autre'];
    const featured = getFeaturedSource(article.source?.name);

    return (
        <article
            className={`group relative flex min-h-full flex-col overflow-hidden rounded-xl border bg-[#0d121a]/[0.90] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#111824]/[0.95] hover:shadow-2xl hover:shadow-black/30 ${featured ? featured.border : 'border-slate-500/15'
                }`}
            style={featured ? { boxShadow: featured.shadow } : undefined}
        >
            <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.18] to-transparent" />

            {article.image && (
                <div className="relative h-44 overflow-hidden border-b border-slate-500/15">
                    <img
                        src={article.image}
                        alt={article.title}
                        className="w-full h-full object-cover opacity-[0.88] saturate-[0.92] transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d121a] via-transparent to-black/20" />
                </div>
            )}

            <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-4rem)] flex-wrap gap-2">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border backdrop-blur-md ${categoryStyle}`}>
                    {resolvedCategory || 'News'}
                </span>
                {featured && (
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border backdrop-blur-md ${featured.badge}`}>
                        À surveiller
                    </span>
                )}
            </div>

            <button
                onClick={handleBookmark}
                className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-md text-white border border-white/10 transition-colors"
                title={isBookmarked ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
                <Bookmark size={16} className={isBookmarked ? "fill-amber-300 text-amber-300" : "text-slate-300"} />
            </button>

            <div className="p-5 flex-1 flex flex-col">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                    <div className={`min-w-0 flex items-center space-x-2 font-bold ${featured ? featured.label : 'text-cyan-200'}`}>
                        {article.source?.image && (
                            <img src={article.source.image} alt="" className="w-4 h-4 rounded-sm object-contain bg-white/[0.08]" />
                        )}
                        <span className="truncate">{article.source?.name}</span>
                    </div>
                    <span className="shrink-0 text-slate-500 italic">
                        {formatDistanceToNow(new Date(article.date), { addSuffix: true })}
                    </span>
                </div>

                <h3 className="text-lg font-black text-slate-100 leading-snug mb-3 tracking-tight group-hover:text-cyan-100 transition-colors">
                    <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:underline decoration-cyan-300/50 underline-offset-4">
                        {article.title}
                    </a>
                </h3>

                <div className="text-xs text-slate-500 mb-4">
                    <span className="font-semibold">
                        {new Date(article.date).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                </div>

                {summary ? (
                    <div className="mt-auto rounded-lg border border-cyan-300/15 bg-cyan-400/[0.055] p-3">
                        <div className="flex items-center space-x-2 mb-1.5 text-cyan-200 text-[11px] font-black uppercase tracking-[0.16em]">
                            <Sparkles size={12} />
                            <span>Résumé IA</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed animate-in fade-in">{summary}</p>
                    </div>
                ) : (
                    article.content ? (
                        <p className="text-sm text-slate-400 leading-6 line-clamp-3 mb-4">{article.content.replace(/<[^>]+>/g, '')}</p>
                    ) : null
                )}

                <div className="mt-4 pt-4 border-t border-slate-500/15 flex items-center justify-between">
                    {!summary && (
                        <button
                            onClick={handleSummarize}
                            disabled={loading}
                            className="flex items-center space-x-2 text-sm font-bold text-slate-300 hover:text-white bg-slate-400/[0.07] hover:bg-slate-400/[0.12] border border-slate-500/15 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Bot size={16} className={loading ? "animate-spin" : ""} />
                            <span>{loading ? 'Analyse...' : 'Résumer'}</span>
                        </button>
                    )}

                    <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto rounded-lg p-2 text-slate-400 hover:text-cyan-200 hover:bg-cyan-400/10 transition-colors"
                    >
                        <ExternalLink size={18} />
                    </a>
                </div>
            </div>
        </article>
    );
}
