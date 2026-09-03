import React from 'react';
import { CalendarDays, ExternalLink, FileWarning, ShieldCheck, ShieldQuestion } from 'lucide-react';

const SOURCE_STYLES = {
    'Bonjour la fuite': 'from-violet-500/20 via-fuchsia-500/10 to-transparent text-fuchsia-200 border-fuchsia-300/25',
    'Fuites Infos': 'from-amber-500/20 via-orange-500/10 to-transparent text-amber-200 border-amber-300/25',
    FrenchBreaches: 'from-cyan-500/20 via-sky-500/10 to-transparent text-cyan-200 border-cyan-300/25'
};

function getStatus(title = '', content = '') {
    const text = `${title} ${content}`.toLowerCase();

    if (text.includes('confirm')) {
        return { label: 'Confirmée', icon: ShieldCheck, className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' };
    }

    if (text.includes('revendiqu')) {
        return { label: 'Revendiquée', icon: ShieldQuestion, className: 'border-amber-400/25 bg-amber-400/10 text-amber-200' };
    }

    return { label: 'À surveiller', icon: FileWarning, className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100' };
}

function toPlainText(value = '') {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function BreachCard({ article }) {
    const sourceName = article.source?.name || 'Source de veille';
    const sourceStyle = SOURCE_STYLES[sourceName] || SOURCE_STYLES.FrenchBreaches;
    const status = getStatus(article.title, article.content);
    const StatusIcon = status.icon;
    const date = new Date(article.date);
    const formattedDate = Number.isNaN(date.getTime())
        ? 'Date non communiquée'
        : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const summary = toPlainText(article.content) || 'Consultez la source pour le détail de cette alerte.';

    return (
        <article className="group relative flex min-h-[390px] flex-col overflow-hidden rounded-2xl border theme-border surface-card transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/35 hover:shadow-2xl hover:shadow-cyan-950/20">
            <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${sourceStyle}`} aria-hidden="true" />
            <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" aria-hidden="true" />

            <div className="relative flex items-start justify-between gap-3 p-5 pb-0">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border theme-border bg-[var(--color-surface-raised)] shadow-lg shadow-black/10">
                        {article.source?.image ? (
                            <img src={article.source.image} alt="" className="h-8 w-8 object-contain" />
                        ) : (
                            <span className="text-sm font-black text-accent">{sourceName.slice(0, 2).toUpperCase()}</span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black text-primary">{sourceName}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                            <CalendarDays size={13} aria-hidden="true" />
                            <time dateTime={article.date}>{formattedDate}</time>
                        </div>
                    </div>
                </div>

                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${status.className}`}>
                    <StatusIcon size={12} aria-hidden="true" />
                    {status.label}
                </span>
            </div>

            {article.image && (
                <div className="relative mx-5 mt-5 h-28 overflow-hidden rounded-xl border theme-border bg-[var(--color-surface-muted)]">
                    <img src={article.image} alt="" className="h-full w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface-raised)] via-transparent to-transparent" />
                </div>
            )}

            <div className="relative flex flex-1 flex-col p-5">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Incident signalé</p>
                <h2 className="text-xl font-black leading-snug tracking-tight text-primary transition-colors group-hover:text-accent">
                    <a href={article.link} target="_blank" rel="noopener noreferrer" className="focus:outline-none focus:ring-2 focus:ring-cyan-300/50 focus:ring-offset-2 focus:ring-offset-[var(--color-surface-raised)]">
                        {article.title}
                    </a>
                </h2>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-secondary">{summary}</p>

                <div className="mt-auto flex items-center justify-between border-t theme-border pt-4">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">Fuite de données</span>
                    <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ouvrir la source : ${article.title}`}
                        className="rounded-lg p-2 text-muted transition-colors hover:bg-cyan-400/[0.10] hover:text-accent focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                    >
                        <ExternalLink size={18} aria-hidden="true" />
                    </a>
                </div>
            </div>
        </article>
    );
}
