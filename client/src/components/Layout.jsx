import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Activity,
    Bookmark,
    History,
    Layers,
    Menu,
    Moon,
    Newspaper,
    PlayCircle,
    Radar,
    Search,
    ShieldAlert,
    SlidersHorizontal,
    Sun,
    X,
    Zap
} from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../services/api';

const NAV_GROUPS = [
    {
        label: 'Veille',
        items: [
            { to: '/', label: 'Articles', icon: Newspaper },
            { to: '/editorial', label: 'Dossiers & tendances', icon: Layers },
            { to: '/daily-brief', label: 'Brief IA', icon: Zap },
            { to: '/videos', label: 'Vidéos', icon: PlayCircle }
        ]
    },
    {
        label: 'Sécurité',
        items: [
            { to: '/cyber', label: 'Cyber Radar', icon: Radar },
            { to: '/breaches', label: 'Fuites de données', icon: ShieldAlert }
        ]
    },
    {
        label: 'Personnel',
        items: [
            { to: '/bookmarks', label: 'Favoris', icon: Bookmark },
            { to: '/history', label: 'Historique', icon: History }
        ]
    },
    {
        label: 'Système',
        items: [
            { to: '/observatory', label: 'Observatoire', icon: Activity },
            { to: '/sources', label: 'Sources', icon: SlidersHorizontal }
        ]
    }
];

const PAGE_TITLES = {
    '/': 'Actualités',
    '/editorial': 'Dossiers et tendances',
    '/cyber': 'Cyber Radar',
    '/daily-brief': 'Brief IA Quotidien',
    '/videos': 'Vidéos IA & Tech',
    '/breaches': 'Fuites de données',
    '/sources': 'Administration des sources',
    '/observatory': 'Observatoire des sources',
    '/bookmarks': 'Articles favoris',
    '/history': 'Historique de lecture'
};

function NavItem({ to, icon, children, onClick }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    const IconComponent = icon;

    return (
        <Link
            to={to}
            onClick={onClick}
            aria-current={isActive ? 'page' : undefined}
            className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                isActive
                    ? 'news-chip-active font-semibold'
                    : 'text-secondary border-transparent hover:bg-[var(--color-surface-muted)] hover:text-primary'
            )}
        >
            <IconComponent size={17} aria-hidden="true" className={clsx('shrink-0', isActive ? 'text-accent' : 'text-muted')} />
            <span className="truncate">{children}</span>
        </Link>
    );
}

export default function Layout({ children, onSearch, search, theme, onToggleTheme }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        if (!isSidebarOpen) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsSidebarOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isSidebarOpen]);

    const { data: health, isError: isHealthError } = useQuery({
        queryKey: ['health'],
        queryFn: getHealth,
        refetchInterval: 60000,
        retry: 1
    });

    const isOperational = Boolean(health?.status === 'ok' && !health?.rss?.lastError && !isHealthError);
    const supportsSearch = ['/', '/videos', '/breaches'].includes(location.pathname);

    const toggleSidebar = () => setIsSidebarOpen((open) => !open);
    const closeSidebar = () => setIsSidebarOpen(false);
    const pageTitle = PAGE_TITLES[location.pathname] || 'Actualités';

    return (
        <div className="app-shell flex h-screen font-sans overflow-hidden">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:px-4 focus:py-2.5 surface-card text-sm font-semibold text-primary"
            >
                Aller au contenu principal
            </a>

            {isSidebarOpen && (
                <div
                    className="theme-overlay fixed inset-0 z-40 lg:hidden transition-opacity"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            <aside
                aria-label="Menu latéral"
                className={clsx(
                    'fixed inset-y-0 left-0 z-50 w-64 glass-sidebar flex-shrink-0 flex flex-col transform transition-transform duration-200 ease-out lg:translate-x-0 lg:static',
                    isSidebarOpen ? 'translate-x-0 visible' : '-translate-x-full invisible lg:visible'
                )}
            >
                <div className="h-[68px] px-5 flex items-center justify-between border-b theme-divider shrink-0">
                    <Link
                        to="/"
                        onClick={closeSidebar}
                        className="flex items-center gap-3 rounded-lg py-1 pr-2 focus-visible:outline-none"
                    >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border theme-border surface-muted text-accent">
                            <Newspaper size={19} aria-hidden="true" />
                        </div>
                        <div>
                            <span className="block font-serif text-xl font-bold tracking-tight text-primary leading-none">
                                NewsAI
                            </span>
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mt-1 whitespace-nowrap">
                                Veille tech & cyber
                            </span>
                        </div>
                    </Link>
                    <button
                        type="button"
                        onClick={closeSidebar}
                        className="lg:hidden rounded-lg p-1.5 text-muted hover:text-primary hover:bg-[var(--color-surface-muted)]"
                        aria-label="Fermer le menu"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                    {NAV_GROUPS.map((group) => (
                        <div key={group.label}>
                            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                {group.label}
                            </p>
                            <div className="space-y-0.5">
                                {group.items.map((item) => (
                                    <NavItem key={item.to} to={item.to} icon={item.icon} onClick={closeSidebar}>
                                        {item.label}
                                    </NavItem>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t theme-divider shrink-0">
                    <div className="rounded-lg border theme-border surface-muted px-3.5 py-2.5">
                        <p className="text-[10px] text-muted font-semibold uppercase tracking-[0.18em]">
                            État du service
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className={clsx(
                                    'h-2 w-2 rounded-full shrink-0',
                                    isOperational ? 'bg-emerald-500' : 'bg-amber-500'
                                )}
                            />
                            <span className="text-xs font-semibold text-secondary">
                                {isOperational ? 'Système opérationnel' : 'Synchronisation dégradée'}
                            </span>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 relative">
                <header className="h-[68px] glass-header flex items-center justify-between gap-3 px-4 lg:px-8 sticky top-0 z-30 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            className="p-2 -ml-2 rounded-lg text-muted hover:text-primary hover:bg-[var(--color-surface-muted)] lg:hidden transition-colors"
                            aria-label={isSidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                            aria-expanded={isSidebarOpen}
                        >
                            <Menu size={22} aria-hidden="true" />
                        </button>
                        <span className="text-sm font-semibold text-secondary hidden sm:block truncate">
                            {pageTitle}
                        </span>
                    </div>

                    {supportsSearch && (
                        <div className="relative flex-1 max-w-xl">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-muted" aria-hidden="true" />
                            </div>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => onSearch && onSearch(event.target.value)}
                                className="theme-input block w-full pl-10 pr-9 py-2 rounded-lg text-sm"
                                aria-label="Rechercher des actualités"
                                placeholder="Rechercher un sujet, outil, CVE…"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => onSearch && onSearch('')}
                                    aria-label="Effacer la recherche"
                                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-muted hover:text-primary"
                                >
                                    <X size={15} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex items-center shrink-0">
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            className="theme-toggle"
                            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
                            aria-pressed={theme === 'dark'}
                            title={theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'}
                        >
                            <span className="sr-only">Changer de thème</span>
                            <Sun size={14} className="absolute left-2.5 text-amber-500" aria-hidden="true" />
                            <Moon size={14} className="absolute right-2.5 text-sky-400" aria-hidden="true" />
                            <span className="theme-toggle-thumb">
                                {theme === 'dark' ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
                            </span>
                        </button>
                    </div>
                </header>

                <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    <div className="max-w-[1440px] mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
