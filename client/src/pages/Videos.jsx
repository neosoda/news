import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getVideos } from '../services/api';
import { safeHttpUrl } from '../utils/url';
import { Loader2, PlayCircle, AlertCircle, Youtube, X, ExternalLink } from 'lucide-react';

const TOPIC_OPTIONS = [
    { label: 'IA', value: 'ia' },
    { label: 'IT', value: 'it' },
    { label: 'Tech', value: 'tech' },
    { label: 'Dev', value: 'dev' },
    { label: 'LLM', value: 'llm' }
];

const YOUTUBE_ID_PATTERN = /^[\w-]{6,20}$/;

export default function Videos({ search }) {
    const [selectedTopics, setSelectedTopics] = useState(['ia', 'it', 'tech']);
    const [activeVideo, setActiveVideo] = useState(null);

    const topicsParam = useMemo(() => selectedTopics.join(','), [selectedTopics]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['videos', search, topicsParam],
        queryFn: () => getVideos({ query: search, topics: topicsParam, limit: 24 }),
        staleTime: 1000 * 60 * 15,
        refetchOnWindowFocus: false
    });

    const toggleTopic = (topic) => {
        setSelectedTopics((current) =>
            current.includes(topic)
                ? current.filter((item) => item !== topic)
                : [...current, topic]
        );
    };

    const closePlayer = () => setActiveVideo(null);

    const openPlayer = (video) => {
        const safeUrl = safeHttpUrl(video.url);
        const match = safeUrl?.match(/[?&]v=([\w-]{6,20})/);
        if (!match || !YOUTUBE_ID_PATTERN.test(match[1])) {
            if (safeUrl) {
                window.open(safeUrl, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        setActiveVideo({
            ...video,
            url: safeUrl,
            videoId: match[1]
        });
    };

    React.useEffect(() => {
        if (!activeVideo) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                closePlayer();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeVideo]);

    return (
        <div className="space-y-7">
            <header className="border-b theme-border pb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        <Youtube size={14} aria-hidden="true" />
                        Veille vidéo · Chaînes sélectionnées
                    </p>
                    <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                        Vidéos IA & Tech
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-secondary">
                        Dernières vidéos francophones et internationales sur l’IA, le développement et l’infrastructure.
                    </p>
                </div>

                <div className="surface-card px-4 py-3 flex items-center gap-3 self-start sm:self-auto">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Résultats</span>
                    <span className="text-xl font-bold text-primary tabular-nums">{data?.meta?.total || 0}</span>
                </div>
            </header>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Thèmes vidéo">
                {TOPIC_OPTIONS.map((topic) => {
                    const isActive = selectedTopics.includes(topic.value);
                    return (
                        <button
                            key={topic.value}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => toggleTopic(topic.value)}
                            className={`px-3.5 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                                isActive ? 'news-chip-active' : 'news-chip'
                            }`}
                        >
                            {topic.label}
                        </button>
                    );
                })}
            </div>

            {isLoading ? (
                <div role="status" className="flex flex-col items-center justify-center min-h-[280px] space-y-3">
                    <Loader2 className="animate-spin text-accent" size={32} aria-hidden="true" />
                    <p className="text-sm text-secondary">Chargement des vidéos…</p>
                </div>
            ) : isError ? (
                <div role="alert" className="surface-card border-red-500/30 p-6 text-sm text-red-300 flex items-center justify-center gap-2">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>Impossible de charger les vidéos pour le moment.</span>
                </div>
            ) : (data?.data?.length || 0) === 0 ? (
                <div className="surface-card p-12 text-center text-secondary space-y-3">
                    <PlayCircle size={36} aria-hidden="true" className="mx-auto text-muted opacity-40" />
                    <p className="text-sm">Aucune vidéo trouvée avec ces filtres.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {data.data.map((video) => {
                        const thumbnail = safeHttpUrl(video.thumbnail);
                        return (
                            <button
                                key={video.id}
                                type="button"
                                onClick={() => openPlayer(video)}
                                className="group text-left surface-card surface-card-interactive overflow-hidden flex flex-col"
                            >
                                <div className="aspect-video w-full surface-muted relative overflow-hidden border-b theme-border">
                                    {thumbnail ? (
                                        <img
                                            src={thumbnail}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-muted">
                                            <PlayCircle size={32} aria-hidden="true" />
                                        </div>
                                    )}
                                    <span
                                        aria-hidden="true"
                                        className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[11px] font-semibold text-white"
                                    >
                                        <PlayCircle size={12} />
                                        Lire
                                    </span>
                                </div>
                                <div className="p-4 space-y-2 flex-1 flex flex-col">
                                    <p className="text-xs font-semibold text-accent">{video.channel}</p>
                                    <h3 className="text-base font-semibold leading-snug text-primary group-hover:text-accent transition-colors line-clamp-2">
                                        {video.title}
                                    </h3>
                                    {video.description && (
                                        <p className="text-sm leading-6 text-secondary line-clamp-2">{video.description}</p>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {activeVideo && (
                <div
                    className="fixed inset-0 z-50 theme-overlay p-4 md:p-8 flex items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Lecture vidéo : ${activeVideo.title}`}
                    onClick={closePlayer}
                >
                    <div
                        className="w-full max-w-5xl surface-card overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b theme-border">
                            <h3 className="text-sm sm:text-base font-semibold text-primary line-clamp-1">
                                {activeVideo.title}
                            </h3>
                            <div className="flex items-center gap-2 shrink-0">
                                <a
                                    href={activeVideo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="editorial-btn py-1.5 px-2.5 text-xs"
                                >
                                    <ExternalLink size={13} aria-hidden="true" />
                                    YouTube
                                </a>
                                <button
                                    type="button"
                                    onClick={closePlayer}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border theme-border text-secondary hover:text-primary"
                                    aria-label="Fermer le lecteur"
                                >
                                    <X size={16} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                        <div className="aspect-video bg-black">
                            <iframe
                                src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}`}
                                title={activeVideo.title}
                                className="w-full h-full"
                                loading="lazy"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
