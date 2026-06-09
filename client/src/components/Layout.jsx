import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Rss, Search, Newspaper, Menu, X, Bookmark, Zap, PlayCircle, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';

function NavItem({ to, icon, children, onClick }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    const IconComponent = icon;
    return (
        <Link
            to={to}
            onClick={onClick}
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

export default function Layout({ children, onSearch, theme, onToggleTheme }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setIsSidebarOpen(false);

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/': return 'Dashboard';
            case '/daily-brief': return 'Brief IA Quotidien';
            case '/videos': return 'Vidéos IA & Tech';
            case '/sources': return 'Sources RSS';
            case '/bookmarks': return 'Articles favoris';
            default: return 'Actualités';
        }
    };

    return (
        <div className="app-shell flex h-screen font-sans overflow-hidden">
            {isSidebarOpen && (
                <div
                    className="theme-overlay fixed inset-0 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
                    onClick={closeSidebar}
                />
            )}

            <aside className={clsx(
                "fixed inset-y-0 left-0 z-50 w-72 glass-sidebar flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-7 flex items-center justify-between border-b theme-divider">
                    <div className="flex items-center space-x-3">
                        <div className="bg-cyan-400/10 border border-cyan-300/25 p-2 rounded-lg shadow-lg shadow-cyan-950/30">
                            <Newspaper className="text-cyan-200" size={24} />
                        </div>
                        <div>
                            <span className="block text-2xl font-black tracking-tighter text-primary leading-none">NewsAI</span>
                            <span className="block text-[10px] uppercase tracking-[0.28em] text-muted mt-1">Veille techno</span>
                        </div>
                    </div>
                    <button onClick={closeSidebar} className="lg:hidden text-muted hover:text-primary">
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 p-5 space-y-2.5 mt-3">
                    <NavItem to="/" icon={LayoutDashboard} onClick={closeSidebar}>Articles</NavItem>
                    <NavItem to="/daily-brief" icon={Zap} onClick={closeSidebar}>Brief IA</NavItem>
                    <NavItem to="/videos" icon={PlayCircle} onClick={closeSidebar}>Vidéos</NavItem>
                    <NavItem to="/bookmarks" icon={Bookmark} onClick={closeSidebar}>Favoris</NavItem>
                    <NavItem to="/sources" icon={Rss} onClick={closeSidebar}>Sources</NavItem>
                </nav>

                <div className="p-5 border-t theme-divider">
                    <div className="news-panel rounded-xl p-4">
                        <p className="text-[10px] text-muted font-bold uppercase tracking-[0.22em] mb-2">Status</p>
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></div>
                            <span className="text-sm font-semibold text-secondary">Système opérationnel</span>
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
                        >
                            <Menu size={24} />
                        </button>
                        <h2 className="text-lg font-black text-primary hidden sm:block whitespace-nowrap tracking-tight">
                            {getPageTitle()}
                        </h2>
                    </div>

                    <div className="relative flex-1 max-w-xl mx-4">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-500" />
                        </div>
                        <input
                            type="text"
                            onChange={(e) => onSearch && onSearch(e.target.value)}
                            className="theme-input block w-full pl-12 pr-4 py-2.5 rounded-xl leading-5 transition-all duration-300 text-sm sm:text-base"
                            placeholder="Rechercher des actualités..."
                        />
                    </div>

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
                        <div className="hidden md:flex w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-300/25 items-center justify-center text-accent font-black shadow-lg shadow-cyan-950/20">
                            N
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 lg:p-7 scroll-smooth">
                    <div className="max-w-[1500px] mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
