import React from 'react';
import { CalendarDays, ExternalLink, FileWarning, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { safeHttpUrl, formatShortDate } from '../utils/url';

const SOURCE_ACCENT = {
    'Bonjour la fuite': 'bg-fuchsia-500',
    'Fuites Infos': 'bg-amber-500',
    FrenchBreaches: 'bg-sky-500'
};

function getStatus(title = '', content = '') {
    const text = `${title} ${content}`.toLowerCase();

    if (text.includes('confirm')) {
        return {
            label: 'Confirmée',
            icon: ShieldCheck,
            className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        };
    }

    if (text.includes('revendiqu')) {
        return {
            label: 'Revendiquée',
            icon: ShieldQuestion,
            className: 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        };
    }

    return {
        label: 'À surveiller',
        icon: FileWarning,
        className: 'border-sky-500/30 bg-sky-500/10 text-sky-200'
    };
}

function toPlainText(value = '') {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function BreachCard({ article }) {
    const sourceName = article.source?.name || 'Source de veille';
    const topBar = SOURCE_ACCENT[sourceName] || 'bg-sky-500';
    const status = getStatus(article.title, article.content);
    const StatusIcon = status.icon;
    const link = safeHttpUrl(article.link);
    const sourceImage = safeHttpUrl(article.source?.image);
    const articleImage = safeHttpUrl(article.image);
    const formattedDate = formatShortDate(article.date);
    const summary = toPlainText(article.content) || 'Consultez la source pour le détail de cette alerte.';

    return (
        <article className="relative flex flex-col overflow-hidden surface-card surface-card-interactive">
            <div className={`h-1 w-full ${topBar}`} aria-hidden="true" />

            <div className="flex items-start justify-between gap-3 p-5 pb-0">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border theme-border surface-muted">
                        {sourceImage ? (
                            <img src={sourceImage} alt="" loading="lazy" className="h-6 w-6 object-contain" />
                        ) : (
                            <span className="font-serif text-xs font-bold text-accent">
                                {sourceName.slice(0, 2).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-primary">{sourceName}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                            <CalendarDays size={12} aria-hidden="true" />
                            <time dateTime={article.date}>{formattedDate}</time>
                        </div>
                    </div>
                </div>

                <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                    <StatusIcon size={12} aria-hidden="true" />
                    {status.label}
                </span>
            </div>

            {articleImage && articleImage !== sourceImage && (
                <div className="mx-5 mt-4 aspect-[16/7] overflow-hidden rounded-lg border theme-border surface-muted">
                    <img src={articleImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
            )}

            <div className="flex flex-1 flex-col p-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Incident signalé
                </p>
                <h3 className="text-lg font-semibold leading-snug tracking-tight text-primary">
                    {link ? (
                        <a
                            href={link}
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
                <p className="mt-2.5 line-clamp-3 text-sm leading-6 text-secondary">{summary}</p>

                <div className="mt-auto flex items-center justify-between border-t theme-border pt-3.5 mt-4">
                    <span className="rounded-md border theme-border surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary">
                        Fuite de données
                    </span>
                    {link && (
                        <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ouvrir la source : ${article.title}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline underline-offset-4"
                        >
                            Source
                            <ExternalLink size={13} aria-hidden="true" />
                        </a>
                    )}
                </div>
            </div>
        </article>
    );
}
