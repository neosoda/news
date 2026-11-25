import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink, Bot, Bookmark, Sparkles, Star } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { summarizeArticle, toggleBookmark, getBookmarks, updateBookmarkedSummary } from '../services/api';
import { recordOpened } from '../services/readerPreferences';
import { safeHttpUrl, formatDateTime } from '../utils/url';

const CATEGORY_STYLES = {
    'Cybersecurité': 'border-red-500/30 bg-red-500/10 text-red-300',
    'Intelligence Artificielle': 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
    'Cloud': 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    'Développement': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    'Hardware': 'border-orange-500/30 bg-orange-500/10 text-orange-200',
    'Web': 'border-blue-500/30 bg-blue-500/10 text-blue-200',
    'Business': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    'Société': 'border-pink-500/30 bg-pink-500/10 text-pink-200',
    'Autre': 'theme-border surface-muted text-secondary'
};

const FEATURED_SOURCES = [
    {
        match: (name) => name.includes('korben'),
        ring: 'border-cyan-500/45',
        topBar: 'bg-cyan-500',
        label: 'text-cyan-300',
        badge: 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200'
    },
    {
        match: (name) => name.includes('it connect') || name.includes('it-connect'),
        ring: 'border-emerald-500/45',
        topBar: 'bg-emerald-500',
        label: 'text-emerald-300',
        badge: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
    }
];

function getFeaturedSource(sourceName) {
    if (!sourceName) return null;
    const normalized = sourceName.toLowerCase();
    return FEATURED_SOURCES.find((entry) => entry.match(normalized)) || null;
}

function resolveCategoryStyle(category) {
    return CATEGORY_STYLES[category] || CATEGORY_STYLES['Autre'];
}

function ArticleArtwork({ article, category }) {
    const articleImage = safeHttpUrl(article.image);
    const sourceImage = safeHttpUrl(article.source?.image);
    const hasDistinctPhoto = Boolean(articleImage && articleImage !== sourceImage);
    const [photoFailed, setPhotoFailed] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);

    const sourceName = article.source?.name?.trim() || 'Veille tech';
    const initials = sourceName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();

    if (hasDistinctPhoto && !photoFailed) {
        return (
            <div className="relative aspect-[16/8] w-full overflow-hidden border-b theme-border surface-muted" data-article-artwork="photo">
                <img
                    src={articleImage}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={() => setPhotoFailed(true)}
                />
            </div>
        );
    }

    return (
        <div
            className="relative flex aspect-[16/8] w-full items-center justify-center overflow-hidden border-b theme-border surface-muted px-6"
            data-article-artwork="editorial-fallback"
            aria-hidden="true"
        >
            <div className="flex items-center gap-3.5 rounded-lg border theme-border bg-[var(--color-surface-raised)] px-4 py-3">
                {sourceImage && !logoFailed ? (
                    <img
                        src={sourceImage}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-8 w-8 rounded object-contain shrink-0"
                        onError={() => setLogoFailed(true)}
                    />
                ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border theme-border surface-muted font-serif text-sm font-bold text-accent">
                        {initials || 'TN'}
                    </span>
                )}
                <div className="min-w-0">
                    <span className="block max-w-[11rem] truncate text-xs font-semibold text-primary">
                        {sourceName}
                    </span>
                    <span className="block max-w-[11rem] truncate text-[11px] text-muted">
                        {category}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function ArticleCard({ article }) {
    const queryClient = useQueryClient();
    const [generatedSummary, setGeneratedSummary] = useState(null);
    const [actionError, setActionError] = useState('');
    const [loading, setLoading] = useState(false);

    const summary = generatedSummary || article.summary;
    const { data: bookmarks = [] } = useQuery({
        queryKey: ['bookmarks'],
        queryFn: getBookmarks
    });

    const isBookmarked = bookmarks.some((item) => item.link === article.link);
    const link = safeHttpUrl(article.link);
    const sourceImage = safeHttpUrl(article.source?.image);
    const sourceName = article.source?.name || 'Source';
    const category = article.category || article.source?.category || 'Autre';
    const featured = getFeaturedSource(sourceName);
    const categoryStyle = resolveCategoryStyle(category);

    const date = new Date(article.date);
    const validDate = Number.isFinite(date.getTime());
    const relativeTime = validDate
        ? formatDistanceToNow(date, { addSuffix: true, locale: fr })
        : '';
    const exactDate = validDate ? formatDateTime(article.date) : '';

    const excerpt = (article.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const rememberOpened = () => {
        try {
            queryClient.setQueryData(['reader-history'], recordOpened(article));
        } catch {
            // Opening the original article must always remain possible.
        }
    };

    const handleSummarize = async () => {
        setActionError('');
        setLoading(true);
        try {
            const data = await summarizeArticle(article.id);
            setGeneratedSummary(data.summary);
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            if (isBookmarked) {
                try {
                    const updated = updateBookmarkedSummary(article.link, data.summary);
                    queryClient.setQueryData(['bookmarks'], updated);
                } catch {
                    // Summary remains visible in current view.
                }
            }
        } catch (error) {
            console.error(error);
            setActionError('Résumé indisponible pour le moment. Réessayez plus tard.');
        } finally {
            setLoading(false);
        }
    };

    const handleBookmark = async () => {
        setActionError('');
        try {
            const next = await toggleBookmark({ ...article, summary });
            queryClient.setQueryData(['bookmarks'], next);
        } catch (error) {
            console.error(error);
            setActionError('Impossible de sauvegarder le favori sur cet appareil.');
        }
    };

    return (
        <article
            className={`relative flex flex-col min-w-0 surface-card surface-card-interactive overflow-hidden ${featured ? featured.ring : ''}`}
        >
            {featured && <div className={`h-1 w-full ${featured.topBar}`} aria-hidden="true" />}

            <ArticleArtwork key={article.image || article.source?.image || article.id} article={article} category={category} />

            <div className="p-4 sm:p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2.5 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${categoryStyle}`}>
                            {category}
                        </span>
                        {featured && (
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${featured.badge}`}>
                                <Star size={11} aria-hidden="true" className="fill-current" />
                                À surveiller
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        aria-pressed={isBookmarked}
                        aria-label={isBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        title={isBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        onClick={handleBookmark}
                        className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border theme-border text-secondary hover:text-accent hover:border-[var(--color-border-strong)] transition-colors"
                    >
                        <Bookmark size={16} aria-hidden="true" className={isBookmarked ? 'fill-current text-accent' : ''} />
                    </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs mb-2.5">
                    <div className={`flex items-center gap-1.5 min-w-0 font-semibold ${featured ? featured.label : 'text-secondary'}`}>
                        {sourceImage && (
                            <img src={sourceImage} alt="" loading="lazy" className="h-3.5 w-3.5 rounded-sm object-contain shrink-0" />
                        )}
                        <span className="truncate">{sourceName}</span>
                    </div>
                    {validDate && (
                        <time
                            dateTime={date.toISOString()}
                            title={exactDate}
                            className="shrink-0 text-muted tabular-nums"
                        >
                            {relativeTime}
                        </time>
                    )}
                </div>

                <h3 className="text-[1.0625rem] font-semibold leading-snug tracking-tight text-primary mb-3 break-words">
                    {link ? (
                        <a
                            href={link}
                            onClick={rememberOpened}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-accent hover:underline underline-offset-4 transition-colors"
                        >
                            {article.title}
                        </a>
                    ) : (
                        article.title
                    )}
                </h3>

                {summary ? (
                    <div className="border-l-2 border-[var(--brand-primary)] pl-3 py-0.5 mb-3">
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent mb-1">
                            <Sparkles size={11} aria-hidden="true" />
                            Synthèse IA
                        </p>
                        <p className="text-sm leading-6 text-secondary">{summary}</p>
                    </div>
                ) : excerpt ? (
                    <p className="text-sm leading-6 text-secondary line-clamp-3 mb-3">{excerpt}</p>
                ) : null}

                {actionError && (
                    <p role="alert" className="text-xs font-medium text-red-300 mb-3">
                        {actionError}
                    </p>
                )}

                <div className="mt-auto pt-3 border-t theme-border flex items-center justify-between gap-3">
                    {!summary && (
                        <button
                            type="button"
                            onClick={handleSummarize}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-md border theme-border px-2.5 py-1.5 text-xs font-semibold text-secondary hover:text-primary hover:border-[var(--color-border-strong)] disabled:opacity-60 transition-colors"
                        >
                            <Bot size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                            {loading ? 'Analyse…' : 'Résumer'}
                        </button>
                    )}
                    {link && (
                        <a
                            href={link}
                            onClick={rememberOpened}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Lire l’article original : ${article.title}`}
                            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline underline-offset-4"
                        >
                            Lire la source
                            <ExternalLink size={13} aria-hidden="true" />
                        </a>
                    )}
                </div>
            </div>
        </article>
    );
}
