import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Rss, Search, Newspaper, Menu, X, Bookmark, Zap, PlayCircle, ShieldAlert, Sun, Moon, TrendingUp, History } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../services/api';

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
                "flex items-center space-x-3 px-4 py-3 rounded-lg border transition-all duration-300",
                isActive
                    ? "bg-cyan-400/10 text-primary border-cyan-300/25 shadow-[inset_3px_0_0_rgba(34,211,238,0.9)]"
                    : "text-muted border-transparent hover:bg-cyan-400/[0.08] hover:text-primary hover:border-cyan-300/15"
            )}
        >
            <IconComponent size={19} className={clsx(isActive ? "text-accent" : "text-muted")} />
            <span className="text-sm font-semibold tracking-wide">{children}</span>
        </Link>
    );
}

export default function Layout({ children, onSearch, search, theme, onToggleTheme }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();
    useEffect(() => {
        if (!isSidebarOpen) return;
        const onKeyDown = event => { if (event.key === 'Escape') setIsSidebarOpen(false); };
        window.addEventListener('keydown',onKeyDown);
        return () => window.removeEventListener('keydown',onKeyDown);
    },[isSidebarOpen]);
    const { data: health, isError: isHealthError } = useQuery({
        queryKey: ['health'],
        queryFn: getHealth,
        refetchInterval: 60000,
        retry: 1
    });
    const isOperational = Boolean(health?.status === 'ok' && !health?.rss?.lastError && !isHealthError);
    const supportsSearch = ['/', '/videos', '/breaches'].includes(location.pathname);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setIsSidebarOpen(false);

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/': return 'Actualités';
            case '/editorial': return 'Dossiers et tendances';
            case '/cyber': return 'Cyber Radar';
            case '/daily-brief': return 'Brief IA Quotidien';
            case '/videos': return 'Vidéos IA & Tech';
            case '/breaches': return 'Fuites de données';
            case '/sources': return 'Sources RSS';
            case '/observatory': return 'Observatoire des sources';
            case '/bookmarks': return 'Articles favoris';
            case '/history': return 'Historique de lecture';
            default: return 'Actualités';
        }
    };

    return (
        <div className="app-shell flex h-screen font-sans overflow-hidden">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:p-3 surface-card text-primary">Aller au contenu</a>
            {isSidebarOpen && (
                <div
                    className="theme-overlay fixed inset-0 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
                    onClick={closeSidebar}
                />
            )}

            <aside className={clsx(
                "fixed inset-y-0 left-0 z-50 w-72 glass-sidebar flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static",
                isSidebarOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible"
            )}>
                <div className="p-7 flex items-center justify-between border-b theme-divider">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 text-accent">
                            <Newspaper className="text-cyan-200" size={24} />
                        </div>
                        <div>
                            <span className="block text-2xl font-black tracking-tighter text-primary leading-none">NewsAI</span>
                            <span className="block text-[10px] uppercase tracking-[0.28em] text-muted mt-1">Veille techno</span>
                        </div>
                    </div>
                    <button onClick={closeSidebar} className="lg:hidden text-muted hover:text-primary" aria-label="Fermer le menu">
                        <X size={24} />
                    </button>
                </div>

                <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto p-4 space-y-1 mt-3">
                    <NavItem to="/" icon={LayoutDashboard} onClick={closeSidebar}>Articles</NavItem>
                    <NavItem to="/editorial" icon={TrendingUp} onClick={closeSidebar}>Dossiers et tendances</NavItem>
                    <NavItem to="/daily-brief" icon={Zap} onClick={closeSidebar}>Brief IA</NavItem>
                    <NavItem to="/videos" icon={PlayCircle} onClick={closeSidebar}>Vidéos</NavItem>
                    <NavItem to="/cyber" icon={ShieldAlert} onClick={closeSidebar}>Cyber Radar</NavItem>
                    <NavItem to="/breaches" icon={ShieldAlert} onClick={closeSidebar}>Fuites de données</NavItem>
                    <NavItem to="/bookmarks" icon={Bookmark} onClick={closeSidebar}>Favoris</NavItem>
                    <NavItem to="/history" icon={History} onClick={closeSidebar}>Historique</NavItem>
                    <NavItem to="/observatory" icon={Rss} onClick={closeSidebar}>Observatoire</NavItem>
                    <NavItem to="/sources" icon={Rss} onClick={closeSidebar}>Sources</NavItem>
                </nav>

                <div className="p-5 border-t theme-divider">
                    <div className="news-panel rounded-xl p-4">
                        <p className="text-[10px] text-muted font-bold uppercase tracking-[0.22em] mb-2">État du service</p>
                        <div className="flex items-center space-x-2">
                            <div className={clsx('w-2 h-2 rounded-full shadow-sm', isOperational ? 'bg-emerald-400 shadow-emerald-400/50' : 'bg-amber-400 shadow-amber-400/50')}></div>
                            <span className="text-sm font-semibold text-secondary">{isOperational ? 'Système opérationnel' : 'Système indisponible'}</span>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 relative">
                <header className="h-[72px] glass-header flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 -ml-2 text-muted hover:text-primary lg:hidden transition-colors"
                            aria-label={isSidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                            aria-expanded={isSidebarOpen}
                        >
                            <Menu size={24} />
                        </button>
                        <h2 className="text-lg font-black text-primary hidden sm:block whitespace-nowrap tracking-tight">
                            {getPageTitle()}
                        </h2>
                    </div>

                    {supportsSearch && <div className="relative flex-1 max-w-xl mx-4">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-500" />
                        </div>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => onSearch && onSearch(e.target.value)}
                            className="theme-input block w-full pl-12 pr-4 py-2.5 rounded-xl leading-5 transition-all duration-300 text-sm sm:text-base"
                            aria-label="Rechercher des actualités"
                            placeholder="Rechercher…"
                        />
                    </div>}

                    <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            className="theme-toggle"
                            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
                            aria-pressed={theme === 'dark'}
                            title={theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'}
                        >
                            <span className="sr-only">Changer de thème</span>
                            <Sun size={16} className="absolute left-3 text-amber-400" aria-hidden="true" />
                            <Moon size={16} className="absolute right-3 text-cyan-300" aria-hidden="true" />
                            <span className="theme-toggle-thumb">
                                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                            </span>
                        </button>
                    </div>
                </header>

                <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 lg:p-7 scroll-smooth">
                    <div className="max-w-[1500px] mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
