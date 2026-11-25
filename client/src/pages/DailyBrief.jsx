import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDailyBrief, getBriefArchive, getBriefEdition } from '../services/api';
import { parseBrief, slugify } from '../services/briefParser';
import { recordOpened } from '../services/readerPreferences';
import { safeHttpUrl } from '../utils/url';
import { Calendar, Newspaper, AlertCircle, RefreshCw, ArrowUpRight, Archive } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

// Renders the inline Markdown subset the LLM uses as React nodes, never as HTML.
function Inline({ text }) {
    const parts = String(text).split(INLINE_RE).filter(Boolean);
    return parts.map((part, i) => {
        if (/^(\*\*|__).+\1$/.test(part)) {
            return <strong key={i} className="font-semibold text-primary">{part.slice(2, -2)}</strong>;
        }
        if (/^`.+`$/.test(part)) {
            return <code key={i} className="rounded surface-muted px-1 py-0.5 font-mono text-[0.9em] text-primary">{part.slice(1, -1)}</code>;
        }
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (link) {
            const safeUrl = safeHttpUrl(link[2]);
            if (safeUrl) {
                return <a key={i} href={safeUrl} target="_blank" rel="noopener noreferrer" className="brief-link">{link[1]}</a>;
            }
            return <React.Fragment key={i}>{link[1]}</React.Fragment>;
        }
        if (/^([*_]).+\1$/.test(part)) {
            return <em key={i}>{part.slice(1, -1)}</em>;
        }
        // Unbalanced markers left by truncated model output
        return <React.Fragment key={i}>{part.replace(/\*{1,2}|__/g, '')}</React.Fragment>;
    });
}

function Blocks({ blocks }) {
    return blocks.map((block, i) => {
        if (block.type === 'list') {
            const List = block.ordered ? 'ol' : 'ul';
            return (
                <List key={i} className={`space-y-1.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}>
                    {block.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}
                </List>
            );
        }
        return <p key={i}><Inline text={block.text} /></p>;
    });
}

function sourceName(article) {
    return article.source?.name || article.sourceName || (() => {
        try { return new URL(article.link).hostname.replace(/^www\./, ''); } catch { return null; }
    })();
}

function todayParisKey() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const part = (type) => parts.find((item) => item.type === type)?.value;
    return [part('year'), part('month'), part('day')].join('-');
}

function BriefSection({ section, onOpenArticle }) {
    const brief = useMemo(() => parseBrief(section.summary, section.category), [section.summary, section.category]);
    const articles = section.topArticles || [];
    const slug = slugify(section.category);

    const cited = [];
    brief.points.forEach((point) => point.cites.forEach((n) => {
        if (articles[n - 1] && !cited.includes(n)) cited.push(n);
    }));
    cited.sort((a, b) => a - b);
    const sources = cited.length
        ? cited.map((n) => ({ n, article: articles[n - 1] }))
        : articles.map((article, i) => ({ n: i + 1, article }));

    return (
        <article id={slug} aria-labelledby={`${slug}-title`} className="scroll-mt-24 border-t theme-border pt-8 md:pt-10 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
            <div className="mb-4 flex items-baseline justify-between gap-4 lg:mb-0 lg:block">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">{section.category}</p>
                <p className="text-xs text-secondary lg:mt-2">
                    {section.articleCount} article{section.articleCount > 1 ? 's' : ''} analysé{section.articleCount > 1 ? 's' : ''}
                </p>
            </div>

            <div className="min-w-0 max-w-[44rem]">
                <h2 id={`${slug}-title`} className="font-serif text-[1.75rem] font-semibold leading-tight tracking-tight text-primary text-balance md:text-[2.125rem]">
                    {brief.title || section.category}
                </h2>
                {brief.lede && (
                    <p className="mt-4 text-lg leading-relaxed text-secondary md:text-xl md:leading-relaxed text-pretty">
                        <Inline text={brief.lede} />
                    </p>
                )}

                {brief.points.length > 0 && (
                    <ol className="mt-8 border-y theme-border">
                        {brief.points.map((point, i) => (
                            <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t theme-border py-6 first:border-t-0 md:grid-cols-[2.5rem_minmax(0,1fr)]">
                                <span aria-hidden="true" className="pt-0.5 font-mono text-sm tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
                                <div className="min-w-0">
                                    {point.title && (
                                        <h3 className="mb-2 text-lg font-semibold leading-snug text-primary text-balance">{point.title}</h3>
                                    )}
                                    <div className="space-y-3 text-[1.0625rem] leading-[1.7] text-secondary text-pretty">
                                        <Blocks blocks={point.blocks} />
                                    </div>
                                    {point.cites.some((n) => safeHttpUrl(articles[n - 1]?.link)) && (
                                        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-secondary">
                                            <span>Sources</span>
                                            {point.cites
                                                .filter((n) => safeHttpUrl(articles[n - 1]?.link))
                                                .map((n) => {
                                                    const refArticle = articles[n - 1];
                                                    const href = safeHttpUrl(refArticle.link);
                                                    return (
                                                        <a
                                                            key={n}
                                                            href={href}
                                                            onClick={() => onOpenArticle(refArticle)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={refArticle.title}
                                                            aria-label={`Source ${n} : ${refArticle.title}`}
                                                            className="brief-cite"
                                                        >
                                                            {n}
                                                        </a>
                                                    );
                                                })}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}

                {sources.length > 0 && (
                    <footer className="mt-8">
                        <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                            {cited.length ? 'Sources citées' : 'Articles de la rubrique'}
                        </h4>
                        <ol className="grid gap-x-8 sm:grid-cols-2">
                            {sources.map(({ n, article }) => {
                                const href = safeHttpUrl(article.link);
                                return (
                                    <li key={article.id || n}>
                                        {href ? (
                                            <a
                                                href={href}
                                                onClick={() => onOpenArticle(article)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="brief-source group"
                                            >
                                                <span className="font-mono text-xs tabular-nums text-muted">{n}</span>
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium leading-snug text-primary line-clamp-2 group-hover:text-accent">{article.title}</span>
                                                    <span className="mt-1 block text-xs text-secondary opacity-80">
                                                        {[sourceName(article), article.date && format(new Date(article.date), "d MMM, HH'h'mm", { locale: fr })].filter(Boolean).join(' · ')}
                                                    </span>
                                                </span>
                                                <ArrowUpRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                                            </a>
                                        ) : (
                                            <div className="brief-source">
                                                <span className="font-mono text-xs tabular-nums text-muted">{n}</span>
                                                <span className="min-w-0 text-sm font-medium text-primary">{article.title}</span>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </footer>
                )}
            </div>
        </article>
    );
}

export default function DailyBrief() {
    const queryClient = useQueryClient();
    const [edition, setEdition] = useState('');
    const currentParisDate = useMemo(() => todayParisKey(), []);

    const archive = useQuery({
        queryKey: ['brief-archive'],
        queryFn: getBriefArchive,
        staleTime: 300000
    });

    const archivedEditions = useMemo(
        () => (archive.data || []).filter((item) => item.dateKey !== currentParisDate),
        [archive.data, currentParisDate]
    );

    const todayLabel = edition
        ? format(new Date(`${edition}T12:00:00`), 'EEEE d MMMM yyyy', { locale: fr })
        : new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(new Date());
    const formattedDate = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

    const { data: briefResult, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['daily-brief', edition],
        queryFn: () => (edition ? getBriefEdition(edition) : getDailyBrief()),
        staleTime: 1000 * 60 * 60,
        refetchOnWindowFocus: false
    });

    const briefs = briefResult?.briefs;
    const totalArticles = briefs?.reduce((sum, s) => sum + (s.articleCount || 0), 0) || 0;

    const handleOpenArticle = (article) => {
        try {
            queryClient.setQueryData(['reader-history'], recordOpened(article));
        } catch {
            // Opening the article must not fail.
        }
    };

    return (
        <div className="mx-auto max-w-5xl pb-20">
            <header className="pb-8 pt-2 md:pb-10">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
                            <Calendar size={14} aria-hidden="true" />
                            {formattedDate}
                        </p>
                        <h1 className="font-serif text-4xl font-semibold tracking-tight text-primary md:text-5xl">
                            Le Brief IA
                        </h1>
                        <p className="mt-3 max-w-2xl text-base leading-relaxed text-secondary">
                            L’essentiel de l’actualité tech des dernières 24 heures, synthétisé rubrique par rubrique avec renvois vers les sources.
                        </p>
                    </div>

                    <div className="shrink-0">
                        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                            <span className="inline-flex items-center gap-1.5">
                                <Archive size={12} aria-hidden="true" />
                                Édition
                            </span>
                            <select
                                value={edition}
                                onChange={(event) => setEdition(event.target.value)}
                                className="block mt-1.5 theme-input rounded-lg px-3 py-2 text-sm min-w-[11rem]"
                            >
                                <option value="">Aujourd’hui</option>
                                {archivedEditions.map((item) => (
                                    <option key={item.dateKey} value={item.dateKey}>
                                        {item.dateKey.split('-').reverse().join('/')}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {archive.isError && (
                            <p className="text-xs text-muted mt-1.5">Archives momentanément indisponibles.</p>
                        )}
                    </div>
                </div>

                {briefs?.length > 0 && (
                    <nav aria-label="Rubriques du brief" className="mt-6">
                        <p className="mb-2.5 text-xs text-muted tabular-nums">
                            {briefs.length} rubrique{briefs.length > 1 ? 's' : ''} · {totalArticles} article{totalArticles > 1 ? 's' : ''} analysé{totalArticles > 1 ? 's' : ''}
                        </p>
                        <ul className="flex flex-wrap gap-2">
                            {briefs.map((section) => (
                                <li key={section.category}>
                                    <a
                                        href={`#${slugify(section.category)}`}
                                        className="news-chip inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
                                    >
                                        {section.category}
                                        <span className="text-xs tabular-nums text-muted">{section.articleCount}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </header>

            {briefResult?.stale && (
                <p role="status" className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Dernière édition disponible affichée : l’actualisation IA est temporairement indisponible.
                </p>
            )}

            {isLoading ? (
                <div aria-busy="true" aria-label="Chargement du brief" className="space-y-12 border-t theme-border pt-10">
                    {[0, 1].map((i) => (
                        <div key={i} className="max-w-[44rem] animate-pulse space-y-4 lg:ml-[14rem]">
                            <div className="h-3 w-28 rounded surface-muted" />
                            <div className="h-8 w-3/4 rounded surface-muted" />
                            <div className="h-4 w-full rounded surface-muted" />
                            <div className="h-4 w-5/6 rounded surface-muted" />
                        </div>
                    ))}
                    <p className="text-sm text-muted">Synthèse des articles en cours…</p>
                </div>
            ) : isError ? (
                <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-500/25 bg-red-500/10 p-8 text-center">
                    <AlertCircle className="mx-auto mb-4 h-9 w-9 text-red-400" aria-hidden="true" />
                    <h2 className="mb-2 text-lg font-semibold text-primary">Erreur de génération</h2>
                    <p className="text-sm text-red-300">Impossible de charger le brief pour le moment. Veuillez réessayer plus tard.</p>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="editorial-btn mt-5"
                    >
                        <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                        Réessayer
                    </button>
                </div>
            ) : (!briefs || briefs.length === 0) ? (
                <div className="border-t theme-border py-20 text-center text-secondary">
                    <Newspaper className="mx-auto mb-4 h-10 w-10 opacity-35" aria-hidden="true" />
                    <p className="text-base font-medium">Pas assez d’actualités récentes pour générer un brief complet.</p>
                </div>
            ) : (
                <div className="space-y-14 md:space-y-16">
                    {briefs.map((section) => (
                        <BriefSection
                            key={section.category}
                            section={section}
                            onOpenArticle={handleOpenArticle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
