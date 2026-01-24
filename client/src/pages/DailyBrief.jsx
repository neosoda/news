import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDailyBrief } from '../services/api';
import { Loader2, Calendar, Newspaper, ArrowRight, Share2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function DailyBrief() {
    // Generate date string for "Today, 24 January"
    const today = format(new Date(), 'EEEE d MMMM', { locale: fr });

    // Capitalize first letter of date
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    const { data: briefs, isLoading, isError } = useQuery({
        queryKey: ['daily-brief'],
        queryFn: getDailyBrief,
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
        refetchOnWindowFocus: false
    });

    return (
        <div className="max-w-5xl mx-auto pb-20">
            {/* Header Section */}
            <div className="text-center py-12 border-b border-white/5 mb-12">
                <div className="inline-flex items-center space-x-2 text-blue-400 font-bold uppercase tracking-[0.2em] text-xs mb-4">
                    <Calendar size={14} />
                    <span>{formattedDate}</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6">
                    Le <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500">Brief IA</span>
                </h1>
                <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                    L'essentiel de l'actualité tech des dernières 24h, analysé et synthétisé par notre intelligence artificielle.
                </p>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
                        <Loader2 className="animate-spin text-blue-500 relative z-10" size={64} />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-bold text-white">Analyse en cours...</h3>
                        <p className="text-gray-400">Notre IA lit et synthétise des centaines d'articles pour vous.</p>
                    </div>
                </div>
            ) : isError ? (
                <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl text-center max-w-lg mx-auto">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Erreur de génération</h3>
                    <p className="text-red-300">Impossible de créer le brief pour le moment. Veuillez réessayer plus tard.</p>
                </div>
            ) : (!briefs || briefs.length === 0) ? (
                <div className="text-center text-gray-400 py-20">
                    <Newspaper className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-xl font-medium">Pas assez d'actualités récentes pour générer un brief complet.</p>
                </div>
            ) : (
                <div className="space-y-16">
                    {briefs.map((section, index) => (
                        <section key={index} className="group relative">
                            {/* Decorative timeline line */}
                            {index !== briefs.length - 1 && (
                                <div className="absolute left-8 top-16 bottom-0 w-px bg-gradient-to-b from-blue-500/50 to-transparent hidden md:block opacity-30"></div>
                            )}

                            <div className="flex flex-col md:flex-row gap-8">
                                {/* Visual Side (Desktop) */}
                                <div className="hidden md:block w-1/3 flex-shrink-0">
                                    <div className="sticky top-24">
                                        <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/5 relative group-hover:scale-[1.02] transition-transform duration-500">
                                            {section.heroImage ? (
                                                <>
                                                    <img
                                                        src={section.heroImage}
                                                        alt={section.category}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-60"></div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                                    <Newspaper className="text-gray-600 w-12 h-12" />
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4">
                                                <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                                                    {section.category}
                                                </span>
                                            </div>
                                            <div className="absolute bottom-4 left-4 right-4">
                                                <p className="text-white text-sm font-medium opacity-90 drop-shadow-md">
                                                    {section.articleCount} articles analysés
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Content Side */}
                                <div className="flex-1 bg-gray-800/30 border border-white/5 rounded-3xl p-6 md:p-8 hover:bg-white/5 transition-colors duration-300">
                                    {/* Mobile Title View */}
                                    <div className="flex items-center justify-between mb-6 md:hidden">
                                        <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">
                                            {section.category}
                                        </span>
                                        <div className="bg-white/10 px-2 py-1 rounded-md text-xs font-mono text-gray-300">
                                            {section.articleCount} sources
                                        </div>
                                    </div>

                                    <h2 className="text-2xl md:text-3xl font-bold text-gray-100 mb-6 leading-tight">
                                        Les points clés
                                    </h2>

                                    <div className="prose prose-invert prose-lg max-w-none text-gray-300 leading-relaxed space-y-4">
                                        {section.summary.split('\n').map((paragraph, i) => (
                                            <p key={i} className={paragraph.startsWith('-') ? "pl-4 border-l-2 border-blue-500/50" : ""}>
                                                {paragraph}
                                            </p>
                                        ))}
                                    </div>

                                    {/* Sources / Read More */}
                                    <div className="mt-8 pt-6 border-t border-white/5">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                                            Sources principales
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {section.topArticles.map((article) => (
                                                <a
                                                    key={article.id}
                                                    href={article.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center space-x-2 bg-gray-900 hover:bg-blue-600/20 hover:text-blue-400 border border-white/10 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-300"
                                                >
                                                    <span className="truncate max-w-[200px]">{article.title}</span>
                                                    <ArrowRight size={12} className="opacity-50" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
