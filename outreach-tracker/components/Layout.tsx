import React, { useState } from 'react';
import Head from 'next/head';
import {
    HomeIcon,
    UsersIcon,
    TableCellsIcon,
    Cog6ToothIcon,
    Bars3Icon,
    XMarkIcon,
    ChartBarIcon,
    BellIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCurrentUser } from '../contexts/CurrentUserContext';

interface LayoutProps {
    children: React.ReactNode;
    title?: string;
}

export default function Layout({ children, title = 'Outreach Tracker' }: LayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const router = useRouter();
    const { user, effectiveIsAdmin, viewAsMember, setViewAsMember } = useCurrentUser();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: HomeIcon, description: 'Command center overview' },
        { name: 'Committee Workspace', href: '/committee', icon: UsersIcon, description: 'My assignments' },
        { name: 'All Companies', href: '/companies', icon: TableCellsIcon, description: 'Master database' },
        { name: 'Analytics', href: '/analytics', icon: ChartBarIcon, description: 'Progress insights' },
        ...(effectiveIsAdmin ? [{ name: 'Settings', href: '/settings', icon: Cog6ToothIcon, description: 'Admin settings' }] : []),
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Head>
                <title>{title}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/75 lg:hidden backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                {/* Logo Area */}
                <div className="h-20 flex items-center px-6 border-b border-slate-800/50">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">Outreach Tracker</h1>
                            <p className="text-xs text-slate-400">Company Outreach</p>
                        </div>
                    </div>
                    <button
                        className="lg:hidden text-slate-400 hover:text-white transition-colors p-1"
                        onClick={() => setSidebarOpen(false)}
                        aria-label="Close sidebar"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
                    <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Main Menu
                    </p>
                    {navItems.map((item) => {
                        const isActive = item.href === '/'
                            ? router.pathname === '/'
                            : router.pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`
                                    group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                                    ${isActive
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/50'
                                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'}
                                `}
                            >
                                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium">{item.name}</div>
                                    {!isActive && (
                                        <div className="text-xs text-slate-500 group-hover:text-slate-400 truncate">
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                {/* Quick Stats */}
                <div className="p-4 mx-4 mb-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Quick Stats
                        </p>
                        <BellIcon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">Active Today</span>
                            <span className="font-bold text-green-400">12</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">Pending</span>
                            <span className="font-bold text-amber-400">5</span>
                        </div>
                    </div>
                </div>

                {/* User Profile */}
                <div className="p-4 border-t border-slate-800/50 space-y-2">
                    {effectiveIsAdmin ? (
                        <Link href="/settings">
                            <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-slate-700">
                                    {user?.name ? user.name.charAt(0).toUpperCase() : 'G'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Guest'}</p>
                                    <p className="text-xs text-slate-400 truncate">{user?.role ?? 'Committee Member'}</p>
                                </div>
                                <Cog6ToothIcon className="w-5 h-5 text-slate-500" />
                            </div>
                        </Link>
                    ) : (
                        <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-slate-700">
                                {user?.name ? user.name.charAt(0).toUpperCase() : 'G'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Guest'}</p>
                                <p className="text-xs text-slate-400 truncate">{user?.role ?? 'Committee Member'}</p>
                            </div>
                        </div>
                    )}
                    {user?.isAdmin && (
                        <button
                            type="button"
                            onClick={() => setViewAsMember(!viewAsMember)}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
                        >
                            {viewAsMember ? 'Exit member view' : 'View as member'}
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 lg:hidden sticky top-0 z-30 shadow-sm">
                    <button
                        className="text-slate-600 hover:text-slate-900 -ml-2 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open sidebar"
                    >
                        <Bars3Icon className="w-6 h-6" />
                    </button>
                    <span className="ml-4 font-semibold text-slate-900">{title}</span>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    {viewAsMember && user?.isAdmin && (
                        <div className="max-w-[1600px] mx-auto mb-4 flex items-center justify-between gap-2 px-4 py-2 bg-amber-100 border border-amber-300 rounded-lg text-amber-800 text-sm">
                            <span className="font-medium">Viewing as member</span>
                            <button
                                type="button"
                                onClick={() => setViewAsMember(false)}
                                className="font-medium text-amber-700 hover:text-amber-900 underline"
                            >
                                Exit member view
                            </button>
                        </div>
                    )}
                    <div className="max-w-[1600px] mx-auto">
                        {children}
                    </div>
                </main>

                {/* Footer */}
                <footer className="bg-white border-t border-slate-200 px-4 sm:px-6 lg:px-8 py-4">
                    <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
                        <p>© 2026 Outreach Tracker. Built for ME Company Committee.</p>
                        <div className="flex items-center gap-4">
                            <a href="#" className="hover:text-slate-700 transition-colors">Help</a>
                            <span>•</span>
                            <a href="#" className="hover:text-slate-700 transition-colors">Documentation</a>
                            <span>•</span>
                            <a href="#" className="hover:text-slate-700 transition-colors">Support</a>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
