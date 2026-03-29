import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVideos } from '../services/api';
import { Loader2, PlayCircle, AlertCircle, Youtube } from 'lucide-react';

const TOPIC_OPTIONS = [
    { label: 'IA', value: 'ia' },
    { label: 'IT', value: 'it' },
    { label: 'Tech', value: 'tech' },
    { label: 'Dev', value: 'dev' },
    { label: 'LLM', value: 'llm' }
];

export default function Videos({ search }) {
    const [selectedTopics, setSelectedTopics] = useState(['ia', 'it', 'tech']);

    const topicsParam = useMemo(() => selectedTopics.join(','), [selectedTopics]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['videos', search, topicsParam],
        queryFn: () => getVideos({ query: search, topics: topicsParam, limit: 24 }),
        staleTime: 1000 * 60 * 15,
        refetchOnWindowFocus: false
    });

    const toggleTopic = (topic) => {
        setSelectedTopics((current) => {
            if (current.includes(topic)) {
                return current.filter((item) => item !== topic);
            }
            return [...current, topic];
        });
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 space-y-4 sm:space-y-0">
                <div>
                    <div className="flex items-center space-x-2 text-red-500 font-black uppercase tracking-[0.3em] text-[10px] mb-2">
                        <Youtube size={14} />
                        <span>Veille vidéo</span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tighter">
                        Vidéos <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 truncate inline-block">IA & Tech</span>
                    </h1>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 flex items-center space-x-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Résultats</span>
                    <span className="text-xl font-black text-white">{data?.meta?.total || 0}</span>
                </div>
            </div>

            <div className="mb-8 flex flex-wrap gap-3">
                {TOPIC_OPTIONS.map((topic) => {
                    const isActive = selectedTopics.includes(topic.value);
                    return (
                        <button
                            key={topic.value}
                            onClick={() => toggleTopic(topic.value)}
                            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 ${isActive
                                    ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg shadow-red-900/30'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
                                }`}
                        >
                            {topic.label}
                        </button>
                    );
                })}
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[320px] space-y-4">
                    <Loader2 className="animate-spin text-red-500" size={48} />
                    <p className="text-gray-400 font-medium animate-pulse">Chargement des vidéos...</p>
                </div>
            ) : isError ? (
                <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl text-red-400 font-bold flex items-center justify-center space-x-2">
                    <AlertCircle size={18} />
                    <span>Impossible de charger les vidéos pour le moment.</span>
                </div>
            ) : (data?.data?.length || 0) === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[320px] text-gray-500 space-y-3">
                    <PlayCircle size={48} className="opacity-25" />
                    <p>Aucune vidéo trouvée avec ces filtres.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {data.data.map((video) => (
                        <a
                            key={video.id}
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 hover:border-red-500/30 transition-all"
                        >
                            <div className="aspect-video bg-gray-900 relative">
                                {video.thumbnail ? (
                                    <img src={video.thumbnail} alt={video.title} className="h-full w-full object-cover" loading="lazy" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-gray-500">
                                        <PlayCircle size={32} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                            </div>
                            <div className="p-4 space-y-2">
                                <h3 className="text-white font-semibold line-clamp-2 min-h-[3rem]">{video.title}</h3>
                                <p className="text-xs text-gray-500 uppercase tracking-wider">{video.channel}</p>
                                {video.description && (
                                    <p className="text-sm text-gray-400 line-clamp-2">{video.description}</p>
                                )}
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
