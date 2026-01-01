import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Rss, Search, Newspaper, Menu, X } from 'lucide-react';
import clsx from 'clsx';

function NavItem({ to, icon: Icon, children, onClick }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link
            to={to}
            onClick={onClick}
            className={clsx(
                "flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300",
                isActive
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/20"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
            )}
        >
            <Icon size={20} className={clsx(isActive ? "text-white" : "text-gray-500")} />
            <span className="font-semibold tracking-wide">{children}</span>
        </Link>
    );
}

export default function Layout({ children, onSearch }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setIsSidebarOpen(false);

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/': return 'Dashboard';
            case '/sources': return 'Sources RSS';
            default: return 'Actualités';
        }
    };

    return (
        <div className="flex h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
            {/* Overlay for mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                "fixed inset-y-0 left-0 z-50 w-72 glass-sidebar flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-8 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center space-x-3">
                        <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-600/20">
                            <Newspaper className="text-white" size={24} />
                        </div>
                        <span className="text-2xl font-black tracking-tighter text-white">NewsAI</span>
                    </div>
                    <button onClick={closeSidebar} className="lg:hidden text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 p-6 space-y-3 mt-4">
                    <NavItem to="/" icon={LayoutDashboard} onClick={closeSidebar}>Articles</NavItem>
                    <NavItem to="/sources" icon={Rss} onClick={closeSidebar}>Sources</NavItem>
                </nav>

                <div className="p-6 border-t border-white/5">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mb-1">Status</p>
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50"></div>
                            <span className="text-sm font-semibold text-gray-300">Système Opérationnel</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                <header className="h-20 glass-header flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 -ml-2 text-gray-400 hover:text-white lg:hidden transition-colors"
                        >
                            <Menu size={24} />
                        </button>
                        <h2 className="text-xl font-bold text-white hidden sm:block whitespace-nowrap">
                            {getPageTitle()}
                        </h2>
                    </div>

                    <div className="relative flex-1 max-w-xl mx-4">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-500" />
                        </div>
                        <input
                            type="text"
                            onChange={(e) => onSearch && onSearch(e.target.value)}
                            className="block w-full pl-12 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl leading-5 text-gray-100 placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-300 text-sm sm:text-base shadow-inner"
                            placeholder="Rechercher des actualités..."
                        />
                    </div>

                    <div className="hidden md:flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/20">
                            N
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
