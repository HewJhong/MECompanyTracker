import AuthButton from './AuthButton';
import Link from 'next/link';
import { SparklesIcon, ChartBarIcon, UsersIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900">Outreach Tracker</h1>
                            <p className="text-xs text-slate-600">ME Company Committee</p>
                        </div>
                    </div>
                    <AuthButton />
                </div>
            </header>

            {/* Hero Section */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
                        <SparklesIcon className="w-4 h-4" />
                        Streamline Your Sponsorship Outreach
                    </div>
                    <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                        Manage Company Outreach
                        <br />
                        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            All in One Place
                        </span>
                    </h2>
                    <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10">
                        Track progress, coordinate with team members, and never miss a follow-up.
                        Built for the ME Company Committee at Monash University.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <AuthButton />
                        <a
                            href="#features"
                            className="px-6 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
                        >
                            Learn More
                        </a>
                    </div>
                </div>

                {/* Features Grid */}
                <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
                    <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                            <UsersIcon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Committee Workspace</h3>
                        <p className="text-slate-600">
                            See only companies assigned to you. Track your progress and manage contacts efficiently.
                        </p>
                    </div>

                    <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4">
                            <ChartBarIcon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Real-Time Analytics</h3>
                        <p className="text-slate-600">
                            Monitor outreach performance with live dashboards, leaderboards, and progress tracking.
                        </p>
                    </div>

                    <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                            <ShieldCheckIcon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Secure Access</h3>
                        <p className="text-slate-600">
                            Sign in with your Monash account. Role-based access ensures data security.
                        </p>
                    </div>
                </div>

                {/* CTA Section */}
                <div className="mt-24 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-12 text-center text-white shadow-2xl">
                    <h3 className="text-3xl font-bold mb-4">Ready to Get Started?</h3>
                    <p className="text-blue-100 mb-8 text-lg">
                        Sign in with your Monash University account to access your workspace.
                    </p>
                    <AuthButton />
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 mt-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <p className="text-center text-slate-600 text-sm">
                        © 2026 Outreach Tracker. Built for ME Company Committee, Monash University.
                    </p>
                </div>
            </footer>
        </div>
    );
}
