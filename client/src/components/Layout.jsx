import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Rss, Settings, Search, Newspaper } from 'lucide-react';
import clsx from 'clsx';

function NavItem({ to, icon: Icon, children }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link
            to={to}
            className={clsx(
                "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                isActive ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
            )}
        >
            <Icon size={20} />
            <span className="font-medium">{children}</span>
        </Link>
    );
}

export default function Layout({ children, onSearch }) {
    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-950 border-r border-gray-800 flex-shrink-0 flex flex-col">
                <div className="p-6 flex items-center space-x-2 border-b border-gray-800">
                    <Newspaper className="text-blue-500" size={24} />
                    <span className="text-xl font-bold tracking-tight text-white">NewsAI</span>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <NavItem to="/" icon={LayoutDashboard}>Articles</NavItem>
                    <NavItem to="/sources" icon={Rss}>Sources</NavItem>
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-16 border-b border-gray-800 bg-gray-950 flex items-center justify-between px-6">
                    <h2 className="text-lg font-semibold text-white">Dashboard</h2>

                    <div className="relative w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-500" />
                        </div>
                        <input
                            type="text"
                            onChange={(e) => onSearch && onSearch(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-700 rounded-md leading-5 bg-gray-800 text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                            placeholder="Search articles..."
                        />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    {children}
                </main>
            </div>
        </div>
    );
}
