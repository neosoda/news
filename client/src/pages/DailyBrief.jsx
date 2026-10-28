import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDailyBrief } from '../services/api';
import { parseBrief, slugify } from '../services/briefParser';
import { Calendar, Newspaper, AlertCircle, RefreshCw, ArrowUpRight } from 'lucide-react';
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
            return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="brief-link">{link[1]}</a>;
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

function BriefSection({ section }) {
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
                <p className="text-xs text-secondary lg:mt-2">{section.articleCount} article{section.articleCount > 1 ? 's' : ''} analysé{section.articleCount > 1 ? 's' : ''}</p>
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
                                    {point.cites.some((n) => articles[n - 1]) && (
                                        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-secondary">
                                            <span>Sources</span>
                                            {point.cites.filter((n) => articles[n - 1]).map((n) => (
                                                <a
                                                    key={n}
                                                    href={articles[n - 1].link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={articles[n - 1].title}
                                                    aria-label={`Source ${n} : ${articles[n - 1].title}`}
                                                    className="brief-cite"
                                                >
                                                    {n}
                                                </a>
                                            ))}
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
                            {sources.map(({ n, article }) => (
                                <li key={article.id || n}>
                                    <a href={article.link} target="_blank" rel="noopener noreferrer" className="brief-source group">
                                        <span className="font-mono text-xs tabular-nums text-muted">{n}</span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium leading-snug text-primary line-clamp-2 group-hover:text-accent">{article.title}</span>
                                            <span className="mt-1 block text-xs text-secondary opacity-80">
                                                {[sourceName(article), article.date && format(new Date(article.date), "d MMM, HH'h'mm", { locale: fr })].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        <ArrowUpRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </footer>
                )}
            </div>
        </article>
    );
}

export default function DailyBrief() {
    const today = format(new Date(), 'EEEE d MMMM', { locale: fr });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    const { data: briefs, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['daily-brief'],
        queryFn: getDailyBrief,
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
        refetchOnWindowFocus: false
    });

    const totalArticles = briefs?.reduce((sum, s) => sum + (s.articleCount || 0), 0) || 0;

    return (
        <div className="mx-auto max-w-5xl pb-20">
            <header className="pb-8 pt-6 md:pb-10 md:pt-10">
                <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
                    <Calendar size={14} aria-hidden="true" />
                    {formattedDate}
                </p>
                <h1 className="font-serif text-4xl font-semibold tracking-tight text-primary md:text-5xl">Le Brief IA</h1>
                <p className="mt-3 max-w-2xl text-lg leading-relaxed text-secondary">
                    L'essentiel de l'actualité tech des dernières 24 heures, rubrique par rubrique.
                </p>

                {briefs?.length > 0 && (
                    <nav aria-label="Rubriques du brief" className="mt-6">
                        <p className="mb-2 text-xs text-muted">
                            {briefs.length} rubrique{briefs.length > 1 ? 's' : ''} · {totalArticles} articles analysés
                        </p>
                        <ul className="flex flex-wrap gap-2">
                            {briefs.map((section) => (
                                <li key={section.category}>
                                    <a href={`#${slugify(section.category)}`} className="news-chip inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40">
                                        {section.category}
                                        <span className="text-xs tabular-nums text-muted">{section.articleCount}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </header>

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
                <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center">
                    <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-500" aria-hidden="true" />
                    <h2 className="mb-2 text-xl font-bold text-primary">Erreur de génération</h2>
                    <p className="text-red-300">Impossible de créer le brief pour le moment. Veuillez réessayer plus tard.</p>
                    <button type="button" onClick={() => refetch()} disabled={isFetching} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-400/30 px-4 py-2 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-60">
                        <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" /> Réessayer
                    </button>
                </div>
            ) : (!briefs || briefs.length === 0) ? (
                <div className="border-t theme-border py-20 text-center text-secondary">
                    <Newspaper className="mx-auto mb-4 h-12 w-12 opacity-30" aria-hidden="true" />
                    <p className="text-lg font-medium">Pas assez d'actualités récentes pour générer un brief complet.</p>
                </div>
            ) : (
                <div className="space-y-14 md:space-y-16">
                    {briefs.map((section) => (
                        <BriefSection key={section.category} section={section} />
                    ))}
                </div>
            )}
        </div>
    );
}
