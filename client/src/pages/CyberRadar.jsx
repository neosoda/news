import { useDeferredValue, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    ArrowUpRight,
    ChevronDown,
    Radar,
    RefreshCw,
    Search,
    ShieldAlert,
    X
} from 'lucide-react';
import { getKev, getCert } from '../services/api';
import { recordOpened } from '../services/readerPreferences';
import { safeHttpUrl, formatDateTime, formatShortDate } from '../utils/url';

export default function CyberRadar() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [onlyRansomware, setOnlyRansomware] = useState(false);
    const [page, setPage] = useState(1);
    const deferredSearch = useDeferredValue(search);

    const kev = useQuery({
        queryKey: ['kev', deferredSearch, page, onlyRansomware],
        queryFn: () => getKev(deferredSearch, page, { ransomware: onlyRansomware }),
        staleTime: 300000
    });

    const cert = useQuery({
        queryKey: ['cert'],
        queryFn: () => getCert(),
        staleTime: 300000
    });

    const meta = kev.data?.meta;
    const kevCveOnPage = new Set((kev.data?.data || []).map((item) => item.cve));

    const handleSearchChange = (value) => {
        setSearch(value);
        setPage(1);
    };

    const handleToggleRansomware = () => {
        setOnlyRansomware((current) => !current);
        setPage(1);
    };

    const handleInspectCve = (cve) => {
        setOnlyRansomware(false);
        setSearch(cve);
        setPage(1);
    };

    const handleOpenAdvisory = (advisory) => {
        try {
            queryClient.setQueryData(['reader-history'], recordOpened(advisory));
        } catch {
            // Opening the advisory must remain possible.
        }
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8">
            <header className="border-b theme-border pb-6">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    <Radar size={14} aria-hidden="true" />
                    Veille opérationnelle · Sources officielles
                </p>
                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary mt-2">
                    Cyber Radar
                </h1>
                <p className="mt-3 text-sm leading-6 text-secondary max-w-3xl">
                    Vulnérabilités dont l’exploitation active est documentée par la CISA (KEV) et derniers avis publiés par le CERT-FR.
                    Les échéances CISA s’appliquent aux agences fédérales américaines et non directement à votre organisation.
                </p>
            </header>

            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8 items-start">
                <section aria-label="Vulnérabilités exploitées CISA KEV" className="min-w-0 space-y-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b theme-border pb-3">
                        <h2 className="font-serif text-2xl font-semibold text-primary">
                            Vulnérabilités exploitées (CISA KEV)
                        </h2>
                        <a
                            href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        >
                            Catalogue officiel
                            <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                    </div>

                    <div className="news-panel rounded-xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search
                                    size={15}
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                                />
                                <input
                                    type="search"
                                    aria-label="Rechercher une CVE, un éditeur ou un produit"
                                    className="theme-input w-full rounded-lg pl-9 pr-8 py-2 text-sm"
                                    value={search}
                                    onChange={(event) => handleSearchChange(event.target.value)}
                                    placeholder="Rechercher une CVE, un éditeur ou un produit (ex. Fortinet, CVE-2026-…)"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => handleSearchChange('')}
                                        aria-label="Effacer le filtre CVE"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                                    >
                                        <X size={14} aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                aria-pressed={onlyRansomware}
                                onClick={handleToggleRansomware}
                                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors shrink-0 ${
                                    onlyRansomware
                                        ? 'border-red-500/45 bg-red-500/15 text-red-300'
                                        : 'news-chip'
                                }`}
                            >
                                <AlertTriangle size={14} aria-hidden="true" />
                                Rançongiciel connu
                                {typeof meta?.ransomwareTotal === 'number' && (
                                    <span className="rounded px-1.5 py-0.5 text-[11px] tabular-nums surface-muted">
                                        {meta.ransomwareTotal}
                                    </span>
                                )}
                            </button>
                        </div>

                        {meta && (
                            <p className="text-xs text-muted tabular-nums">
                                {meta.total} résultat{meta.total > 1 ? 's' : ''} sur {meta.catalogSize} · Collecte du {formatDateTime(meta.fetchedAt)}
                            </p>
                        )}
                    </div>

                    {kev.isPending ? (
                        <div role="status" className="space-y-3 animate-pulse">
                            {[0, 1, 2].map((index) => (
                                <div key={index} className="surface-card p-5 space-y-2.5">
                                    <div className="h-4 w-32 rounded surface-muted" />
                                    <div className="h-5 w-1/2 rounded surface-muted" />
                                    <div className="h-4 w-3/4 rounded surface-muted" />
                                </div>
                            ))}
                        </div>
                    ) : kev.isError ? (
                        <div role="alert" className="surface-card p-8 text-center space-y-3">
                            <p className="text-sm text-secondary">Catalogue CISA KEV indisponible pour le moment.</p>
                            <button type="button" onClick={() => kev.refetch()} className="editorial-btn">
                                <RefreshCw size={14} aria-hidden="true" />
                                Réessayer
                            </button>
                        </div>
                    ) : (
                        <>
                            {meta?.stale && (
                                <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                                    Dernier catalogue en cache affiché : l’actualisation auprès de la CISA a échoué.
                                </p>
                            )}

                            {kev.data.data.length === 0 ? (
                                <div className="surface-card p-8 text-center space-y-3">
                                    <p className="text-sm text-secondary">Aucune vulnérabilité ne correspond à ces critères.</p>
                                    {(search || onlyRansomware) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearch('');
                                                setOnlyRansomware(false);
                                                setPage(1);
                                            }}
                                            className="editorial-btn"
                                        >
                                            Réinitialiser les filtres
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {kev.data.data.map((vuln) => (
                                        <article key={vuln.cve} className="surface-card p-5 space-y-2.5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <a
                                                        href={`https://www.cve.org/CVERecord?id=${encodeURIComponent(vuln.cve)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-accent hover:underline"
                                                    >
                                                        {vuln.cve}
                                                        <ArrowUpRight size={13} aria-hidden="true" />
                                                    </a>
                                                    {vuln.ransomware === 'Known' && (
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                                                            <AlertTriangle size={11} aria-hidden="true" />
                                                            Rançongiciel connu
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-muted tabular-nums">
                                                    Ajoutée le {vuln.added}
                                                </span>
                                            </div>

                                            <h3 className="text-base font-semibold text-primary">
                                                {vuln.vendor} · {vuln.product}
                                            </h3>
                                            <p className="text-sm leading-6 text-secondary">{vuln.name}</p>

                                            <details className="group pt-1 text-sm text-secondary">
                                                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
                                                    <span>Description et action recommandée CISA (anglais)</span>
                                                    <ChevronDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="mt-3 rounded-lg border theme-border surface-muted p-3.5 space-y-2 text-xs leading-6 text-secondary">
                                                    {vuln.description && <p>{vuln.description}</p>}
                                                    {vuln.action && (
                                                        <p>
                                                            <strong className="text-primary">Action CISA :</strong> {vuln.action}
                                                        </p>
                                                    )}
                                                    {vuln.due && (
                                                        <p className="text-muted tabular-nums">
                                                            Échéance fédérale US : {vuln.due}
                                                        </p>
                                                    )}
                                                </div>
                                            </details>
                                        </article>
                                    ))}
                                </div>
                            )}

                            {meta && meta.pages > 1 && (
                                <nav aria-label="Pagination CISA KEV" className="flex items-center justify-between pt-2">
                                    <button
                                        type="button"
                                        disabled={page <= 1}
                                        onClick={() => setPage((current) => current - 1)}
                                        className="editorial-btn"
                                    >
                                        Précédent
                                    </button>
                                    <span className="text-xs font-medium text-muted tabular-nums">
                                        Page {page} / {meta.pages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={page >= meta.pages}
                                        onClick={() => setPage((current) => current + 1)}
                                        className="editorial-btn"
                                    >
                                        Suivant
                                    </button>
                                </nav>
                            )}
                        </>
                    )}
                </section>

                <aside aria-label="Derniers avis CERT-FR" className="surface-card p-5 space-y-4 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 border-b theme-border pb-3">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={16} aria-hidden="true" className="text-accent" />
                            <h2 className="font-serif text-xl font-semibold text-primary">
                                Avis CERT-FR
                            </h2>
                        </div>
                        <a
                            href="https://www.cert.ssi.gouv.fr/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        >
                            Site officiel
                            <ArrowUpRight size={12} aria-hidden="true" />
                        </a>
                    </div>

                    {cert.isPending ? (
                        <p role="status" className="py-6 text-sm text-secondary">Chargement des avis…</p>
                    ) : cert.isError ? (
                        <div role="alert" className="py-4 space-y-2">
                            <p className="text-sm text-secondary">Avis CERT-FR indisponibles.</p>
                            <button type="button" onClick={() => cert.refetch()} className="editorial-btn text-xs">
                                Réessayer
                            </button>
                        </div>
                    ) : cert.data.length === 0 ? (
                        <p className="py-6 text-sm text-secondary">Aucun avis collecté pour le moment.</p>
                    ) : (
                        <div className="divide-y divide-[var(--color-border)]">
                            {cert.data.map((advisory) => {
                                const href = safeHttpUrl(advisory.link);
                                const matchedKev = new Set([
                                    ...(advisory.kevMatches || []),
                                    ...(advisory.cves || []).filter((cve) => kevCveOnPage.has(cve))
                                ]);

                                return (
                                    <article key={advisory.id} className="py-4 first:pt-1 last:pb-0 space-y-2">
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted">
                                            <span className="font-medium text-secondary truncate">
                                                {advisory.source?.name || 'CERT-FR'}
                                            </span>
                                            <span className="shrink-0 tabular-nums">
                                                {formatShortDate(advisory.date)}
                                            </span>
                                        </div>

                                        {href ? (
                                            <a
                                                href={href}
                                                onClick={() => handleOpenAdvisory(advisory)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-sm font-semibold leading-snug text-primary hover:text-accent hover:underline underline-offset-4"
                                            >
                                                {advisory.title}
                                            </a>
                                        ) : (
                                            <p className="text-sm font-semibold leading-snug text-primary">{advisory.title}</p>
                                        )}

                                        {advisory.cves.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                {advisory.cves.map((cve) => {
                                                    const isKev = matchedKev.has(cve);
                                                    return (
                                                        <button
                                                            key={cve}
                                                            type="button"
                                                            onClick={() => handleInspectCve(cve)}
                                                            title={isKev ? `${cve} — Répertoriée CISA KEV (cliquer pour filtrer)` : `Rechercher ${cve} dans CISA KEV`}
                                                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                                                                isKev
                                                                    ? 'border-red-500/40 bg-red-500/10 text-red-300 font-semibold'
                                                                    : 'theme-border surface-muted text-accent hover:border-[var(--color-border-strong)]'
                                                            }`}
                                                        >
                                                            {cve}
                                                            {isKev && <span>· KEV</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
