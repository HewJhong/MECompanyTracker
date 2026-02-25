import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import Layout from '../components/Layout';
import {
    Cog6ToothIcon,
    UserCircleIcon,
    BellIcon,
    ShieldCheckIcon,
    PaintBrushIcon,
    CheckCircleIcon,
    CircleStackIcon, // Import added
    ArrowPathIcon,   // Import added
    ArrowRightIcon,  // Import added
    ExclamationTriangleIcon, // Import added
    QueueListIcon,    // Import added
    XMarkIcon
} from '@heroicons/react/24/solid';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import DuplicateMergeModal from '../components/DuplicateMergeModal';
import AdminRoute from '../components/AdminRoute';

function SettingsContent() {
    const { user } = useCurrentUser();
    const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'appearance' | 'data'>('profile');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Sync States
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
    const [showSyncPreview, setShowSyncPreview] = useState(false);
    const [syncPreviewData, setSyncPreviewData] = useState<any>(null);

    // Duplicate Scan States
    const [scanning, setScanning] = useState(false);
    const [duplicates, setDuplicates] = useState<any[]>([]);
    const [showScanResults, setShowScanResults] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<any>(null); // For Modal

    // ID Gap States
    const [gapScanning, setGapScanning] = useState(false);
    const [gapResults, setGapResults] = useState<{ count: number; missingIds: string[]; minId: number; maxId: number; totalCompanies: number } | null>(null);
    const [fixingGaps, setFixingGaps] = useState(false);
    const [showFixConfirm, setShowFixConfirm] = useState(false);
    const [fixResult, setFixResult] = useState<{ success: boolean; message: string } | null>(null);

    // Company Insertion States
    const [insertIdInput, setInsertIdInput] = useState('');
    const [insertCompanyName, setInsertCompanyName] = useState('');
    const [insertDiscipline, setInsertDiscipline] = useState('');
    const [insertingCompany, setInsertingCompany] = useState(false);
    const [showInsertConfirm, setShowInsertConfirm] = useState(false);
    const [insertResult, setInsertResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

    // Previous Response Import States
    const [importingResponses, setImportingResponses] = useState(false);
    const [importResult, setImportResult] = useState<{ success: boolean; message: string; stats?: any } | null>(null);

    const [profile, setProfile] = useState({
        name: '',
        email: '',
        role: '',
        timezone: 'Asia/Singapore'
    });

    useEffect(() => {
        if (user) {
            setProfile((p) => ({
                ...p,
                name: user.name || '',
                email: user.email || '',
                role: user.role || 'Committee Member',
            }));
        }
    }, [user]);

    // ... (rest of state initializers unchanged) ...
    // Notification settings
    const [notifications, setNotifications] = useState({
        emailUpdates: true,
        flaggedItems: true,
        dailyDigest: false,
        weeklyReport: true
    });

    // Appearance settings
    const [appearance, setAppearance] = useState({
        theme: 'light',
        compactMode: false,
        showAvatars: true
    });

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        setSaving(false);
        setSaved(true);

        setTimeout(() => setSaved(false), 3000);
    };

    const handleSyncDatabase = async (preview: boolean = true) => {
        setSyncing(true);
        if (!preview) setSyncResult(null); // Clear result if actual sync
        else setSyncPreviewData(null); // Clear preview if getting new preview

        try {
            const res = await fetch('/api/sync-database', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preview })
            });
            const data = await res.json();

            if (data.success) {
                if (preview) {
                    setSyncPreviewData(data);
                    setShowSyncPreview(true);
                } else {
                    const { added, addedToDatabase, updated, duplicatesRemoved } = data.stats;
                    setSyncResult({
                        success: true,
                        message: `Sync complete: Added ${added} to tracker, ${addedToDatabase} to database, updated ${updated} companies, and removed ${duplicatesRemoved} duplicates.`,
                        details: data.details
                    });
                    setShowSyncPreview(false);
                    setSyncPreviewData(null);
                }
            } else {
                const target = preview ? setSyncPreviewData : setSyncResult;
                target({
                    success: false,
                    message: `Sync failed: ${data.message}`
                } as any);
            }
        } catch (error) {
            const target = preview ? setSyncPreviewData : setSyncResult;
            target({
                success: false,
                message: 'An unexpected error occurred during synchronization.'
            } as any);
        } finally {
            setSyncing(false);
        }
    };

    const handleScanDuplicates = async () => {
        setScanning(true);
        setShowScanResults(true);
        try {
            const res = await fetch('/api/duplicates/scan');
            const data = await res.json();
            if (data.success) {
                setDuplicates(data.duplicates);
            }
        } catch (error) {
            console.error('Scan failed', error);
        } finally {
            setScanning(false);
        }
    };

    const handleScanIdGaps = async () => {
        setGapScanning(true);
        setFixResult(null);
        try {
            const res = await fetch('/api/id-gaps/scan');
            const data = await res.json();
            if (data.success) {
                setGapResults(data.gaps);
            }
        } catch (error) {
            console.error('Gap scan failed', error);
        } finally {
            setGapScanning(false);
        }
    };

    const handleFixIdGaps = async () => {
        setFixingGaps(true);
        try {
            const res = await fetch('/api/id-gaps/fix', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setFixResult({ success: true, message: `Successfully renumbered ${data.totalRenumbered} companies to close gaps.` });
                setGapResults(null); // Clear results as they are invalid now
                setShowFixConfirm(false);
            } else {
                setFixResult({ success: false, message: 'Failed to fix gaps.' });
            }
        } catch (error) {
            setFixResult({ success: false, message: 'An error occurred.' });
        } finally {
            setFixingGaps(false);
        }
    };

    const handleInsertCompany = async () => {
        setInsertingCompany(true);
        setInsertResult(null);
        try {
            const res = await fetch('/api/companies/insert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    insertAtId: insertIdInput,
                    companyData: {
                        name: insertCompanyName,
                        discipline: insertDiscipline,
                        targetSponsorshipTier: ''
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                setInsertResult({
                    success: true,
                    message: `Successfully inserted company at ${data.insertedId}. ${data.companiesShifted} companies shifted.`,
                    details: data
                });
                setShowInsertConfirm(false);
                setInsertIdInput('');
                setInsertCompanyName('');
                setInsertDiscipline('');
            } else {
                setInsertResult({ success: false, message: data.message || 'Failed to insert company.' });
            }
        } catch (error) {
            setInsertResult({ success: false, message: 'An error occurred.' });
        } finally {
            setInsertingCompany(false);
        }
    };

    const handleImportPreviousResponses = async () => {
        setImportingResponses(true);
        setImportResult(null);
        try {
            const res = await fetch('/api/import/previous-responses', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                const { stats } = data;
                setImportResult({
                    success: true,
                    message: `Successfully imported! Matched ${stats.matched} companies out of ${stats.totalInOriginal} in original sheet.`,
                    stats
                });
            } else {
                setImportResult({ success: false, message: data.message || 'Failed to import responses.' });
            }
        } catch (error) {
            setImportResult({ success: false, message: 'An error occurred during import.' });
        } finally {
            setImportingResponses(false);
        }
    };

    const tabs = [
        { id: 'profile', label: 'Profile', icon: UserCircleIcon },
        { id: 'notifications', label: 'Notifications', icon: BellIcon },
        { id: 'security', label: 'Security', icon: ShieldCheckIcon },
        { id: 'appearance', label: 'Appearance', icon: PaintBrushIcon },
        { id: 'data', label: 'Data Management', icon: CircleStackIcon } // New Tab
    ];

    return (
        <Layout title="Settings | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-slate-500 to-slate-700 rounded-xl">
                        <Cog6ToothIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
                        <p className="text-slate-600 mt-1">Manage your account and preferences</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar Navigation */}
                <div className="lg:col-span-1">
                    <nav className="space-y-1">
                        {tabs.map(tab => {
                            const TabIcon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${isActive
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                >
                                    <TabIcon className="w-5 h-5" aria-hidden="true" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        {/* Profile Tab */}
                        {activeTab === 'profile' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900 mb-1">Profile Information</h2>
                                    <p className="text-sm text-slate-600">Update your personal details and contact information</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            id="name"
                                            value={profile.name}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            id="email"
                                            value={profile.email}
                                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="role" className="block text-sm font-medium text-slate-700 mb-2">
                                            Role
                                        </label>
                                        <input
                                            type="text"
                                            id="role"
                                            value={profile.role}
                                            onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-2">
                                            Timezone
                                        </label>
                                        <select
                                            id="timezone"
                                            value={profile.timezone}
                                            onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="Asia/Singapore">Singapore (UTC+8)</option>
                                            <option value="America/New_York">New York (UTC-5)</option>
                                            <option value="Europe/London">London (UTC+0)</option>
                                            <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Notifications Tab */}
                        {activeTab === 'notifications' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900 mb-1">Notification Preferences</h2>
                                    <p className="text-sm text-slate-600">Control how and when you receive updates</p>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { id: 'emailUpdates', label: 'Email Updates', description: 'Receive email notifications for important updates' },
                                        { id: 'flaggedItems', label: 'Flagged Items', description: 'Get notified when items are flagged for your attention' },
                                        { id: 'dailyDigest', label: 'Daily Digest', description: 'Receive a summary of activities every day' },
                                        { id: 'weeklyReport', label: 'Weekly Report', description: 'Get a comprehensive weekly performance report' }
                                    ].map(setting => (
                                        <div key={setting.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                                            <input
                                                type="checkbox"
                                                id={setting.id}
                                                checked={notifications[setting.id as keyof typeof notifications]}
                                                onChange={(e) => setNotifications({ ...notifications, [setting.id]: e.target.checked })}
                                                className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                            />
                                            <div className="flex-1">
                                                <label htmlFor={setting.id} className="block text-sm font-medium text-slate-900 cursor-pointer">
                                                    {setting.label}
                                                </label>
                                                <p className="text-xs text-slate-600 mt-1">{setting.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Security Tab */}
                        {activeTab === 'security' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900 mb-1">Security Settings</h2>
                                    <p className="text-sm text-slate-600">Manage your account security and privacy</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <ShieldCheckIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <h3 className="text-sm font-medium text-blue-900">Two-Factor Authentication</h3>
                                                <p className="text-xs text-blue-700 mt-1">Add an extra layer of security to your account</p>
                                                <button className="mt-3 text-sm font-medium text-blue-700 hover:text-blue-800 underline">
                                                    Enable 2FA
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <h3 className="text-sm font-medium text-slate-900 mb-3">Account Management</h3>
                                        <p className="text-xs text-slate-600 mb-4">
                                            You are signed in with Google OAuth. You can sign out of your account here.
                                        </p>
                                        <button
                                            onClick={() => signOut({ callbackUrl: '/' })}
                                            className="w-full px-4 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Sign Out
                                        </button>
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <h3 className="text-sm font-medium text-slate-900 mb-3">Change Password</h3>
                                        <div className="space-y-3">
                                            <input
                                                type="password"
                                                placeholder="Current Password"
                                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <input
                                                type="password"
                                                placeholder="New Password"
                                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <input
                                                type="password"
                                                placeholder="Confirm New Password"
                                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button className="w-full px-4 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors">
                                                Update Password
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                        <h3 className="text-sm font-medium text-red-900 mb-2">Danger Zone</h3>
                                        <p className="text-xs text-red-700 mb-3">Once you delete your account, there is no going back</p>
                                        <button className="text-sm font-medium text-red-700 hover:text-red-800 underline">
                                            Delete Account
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Appearance Tab */}
                        {activeTab === 'appearance' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900 mb-1">Appearance Settings</h2>
                                    <p className="text-sm text-slate-600">Customize how the application looks</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <label className="block text-sm font-medium text-slate-900 mb-3">Theme</label>
                                        <div className="flex gap-3">
                                            {['light', 'dark', 'auto'].map(theme => (
                                                <button
                                                    key={theme}
                                                    onClick={() => setAppearance({ ...appearance, theme })}
                                                    className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all ${appearance.theme === theme
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {[
                                            { id: 'compactMode', label: 'Compact Mode', description: 'Show more information in less space' },
                                            { id: 'showAvatars', label: 'Show Avatars', description: 'Display user avatars throughout the app' }
                                        ].map(setting => (
                                            <div key={setting.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    id={setting.id}
                                                    checked={appearance[setting.id as keyof typeof appearance] as boolean}
                                                    onChange={(e) => setAppearance({ ...appearance, [setting.id]: e.target.checked })}
                                                    className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                                />
                                                <div className="flex-1">
                                                    <label htmlFor={setting.id} className="block text-sm font-medium text-slate-900 cursor-pointer">
                                                        {setting.label}
                                                    </label>
                                                    <p className="text-xs text-slate-600 mt-1">{setting.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Data Management Tab */}
                        {activeTab === 'data' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900 mb-1">Data Management</h2>
                                    <p className="text-sm text-slate-600">Synchronize and manage company data</p>
                                </div>

                                <div className="space-y-6">
                                    {/* Sync Database */}
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-blue-100 rounded-lg">
                                                <ArrowPathIcon className={`w-6 h-6 text-blue-600 ${syncing ? 'animate-spin' : ''}`} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-base font-medium text-slate-900">Synchronize Database</h3>
                                                <p className="text-sm text-slate-600 mt-1">
                                                    Aligns the Outreach Tracker with the Company Database. This will:
                                                </p>
                                                <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
                                                    <li>Add new companies found in Database to Tracker</li>
                                                    <li>Update company names in Tracker to match Database</li>
                                                </ul>

                                                {syncResult && (
                                                    <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${syncResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                                        }`}>
                                                        <p>{syncResult.message}</p>
                                                        {syncResult.details && (
                                                            <div className="mt-2 text-xs space-y-1">
                                                                {syncResult.details.addedIds?.length > 0 && (
                                                                    <div className="font-semibold">Added {syncResult.details.addedIds.length} new companies.</div>
                                                                )}
                                                                {syncResult.details.updatedNameIds?.length > 0 && (
                                                                    <div className="font-semibold text-blue-700">Updated names for {syncResult.details.updatedNameIds.length} companies.</div>
                                                                )}
                                                                {syncResult.details.idChanges?.length > 0 && (
                                                                    <div className="space-y-1">
                                                                        <div className="font-semibold text-purple-700">Healed {syncResult.details.idChanges.length} ID Drifts:</div>
                                                                        <ul className="list-disc list-inside bg-purple-100 p-2 rounded text-purple-800">
                                                                            {syncResult.details.idChanges.map((c: any, i: number) => (
                                                                                <li key={i}>
                                                                                    {c.name}: <span className="font-mono">{c.oldId}</span> <ArrowRightIcon className="w-3 h-3 inline mx-1" /> <span className="font-mono font-bold">{c.newId}</span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="mt-4">
                                                    {!showSyncPreview ? (
                                                        <button
                                                            onClick={() => handleSyncDatabase(true)}
                                                            disabled={syncing}
                                                            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            {syncing ? 'Analyzing...' : 'Preview Sync'}
                                                        </button>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {syncPreviewData?.success ? (
                                                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                                    <div className="flex justify-between items-start mb-4">
                                                                        <div className="flex items-center gap-2 text-blue-800 font-bold">
                                                                            <ExclamationTriangleIcon className="w-5 h-5" />
                                                                            Sync Preview: Proposed Changes
                                                                        </div>
                                                                        <button
                                                                            onClick={() => { setShowSyncPreview(false); setSyncPreviewData(null); }}
                                                                            className="text-blue-400 hover:text-blue-600"
                                                                        >
                                                                            <XMarkIcon className="w-5 h-5" />
                                                                        </button>
                                                                    </div>

                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                                        <div className="p-3 bg-white rounded border border-blue-100 shadow-sm">
                                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Tracker Additions</div>
                                                                            <div className="text-xl font-bold text-blue-700">+{syncPreviewData.stats.added}</div>
                                                                            <div className="text-xs text-slate-500">New companies from Database</div>
                                                                        </div>
                                                                        <div className="p-3 bg-white rounded border border-green-100 shadow-sm">
                                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Database Additions</div>
                                                                            <div className="text-xl font-bold text-green-700">+{syncPreviewData.stats.addedToDatabase}</div>
                                                                            <div className="text-xs text-slate-500">Add Tracker rows to Master DB</div>
                                                                        </div>
                                                                        <div className="p-3 bg-white rounded border border-amber-100 shadow-sm">
                                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Corrections</div>
                                                                            <div className="text-xl font-bold text-amber-600">{syncPreviewData.stats.updated}</div>
                                                                            <div className="text-xs text-slate-500">Name updates & ID healing</div>
                                                                        </div>
                                                                        <div className="p-3 bg-white rounded border border-red-100 shadow-sm">
                                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Tracker Cleanup</div>
                                                                            <div className="text-xl font-bold text-red-600">-{syncPreviewData.stats.duplicatesRemoved}</div>
                                                                            <div className="text-xs text-slate-500">Duplicate rows to remove</div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-6 mb-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                                                        {/* Target: Master Database */}
                                                                        {(syncPreviewData.details.missingInDatabase.length > 0) && (
                                                                            <div className="space-y-3">
                                                                                <div className="flex items-center gap-2 text-green-700">
                                                                                    <div className="h-px flex-1 bg-green-100"></div>
                                                                                    <span className="text-[10px] font-bold uppercase tracking-wider">Target: Master Database</span>
                                                                                    <div className="h-px flex-1 bg-green-100"></div>
                                                                                </div>
                                                                                <div className="bg-white p-3 rounded border border-green-100 shadow-sm">
                                                                                    <div className="text-xs font-bold text-green-700 uppercase mb-2">Add New Companies to Master DB (+{syncPreviewData.details.missingInDatabase.length})</div>
                                                                                    <ul className="space-y-1">
                                                                                        {syncPreviewData.details.missingInDatabase.map((c: any, i: number) => (
                                                                                            <li key={i} className="text-xs flex justify-between items-center text-slate-700">
                                                                                                <span className="font-medium">{c.name}</span>
                                                                                                <span className="font-mono text-slate-400 text-[10px]">{c.id}</span>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Target: Outreach Tracker */}
                                                                        {(syncPreviewData.details.added.length > 0 ||
                                                                            syncPreviewData.details.nameCorrections.length > 0 ||
                                                                            syncPreviewData.details.idChanges.length > 0 ||
                                                                            syncPreviewData.details.duplicatesRemoved.length > 0) && (
                                                                                <div className="space-y-3">
                                                                                    <div className="flex items-center gap-2 text-blue-700">
                                                                                        <div className="h-px flex-1 bg-blue-100"></div>
                                                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Target: Outreach Tracker</span>
                                                                                        <div className="h-px flex-1 bg-blue-100"></div>
                                                                                    </div>

                                                                                    {syncPreviewData.details.added.length > 0 && (
                                                                                        <div className="bg-white p-3 rounded border border-blue-100 shadow-sm">
                                                                                            <div className="text-xs font-bold text-blue-700 uppercase mb-2">Add to Tracker (+{syncPreviewData.details.added.length})</div>
                                                                                            <ul className="space-y-1">
                                                                                                {syncPreviewData.details.added.map((c: any, i: number) => (
                                                                                                    <li key={i} className="text-xs flex justify-between items-center text-slate-700">
                                                                                                        <span className="font-medium">{c.name}</span>
                                                                                                        <span className="font-mono text-slate-400 text-[10px]">{c.id}</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    )}

                                                                                    {syncPreviewData.details.nameCorrections.length > 0 && (
                                                                                        <div className="bg-white p-3 rounded border border-amber-100 shadow-sm">
                                                                                            <div className="text-xs font-bold text-amber-700 uppercase mb-2">Correct Names in Tracker ({syncPreviewData.details.nameCorrections.length})</div>
                                                                                            <ul className="space-y-2">
                                                                                                {syncPreviewData.details.nameCorrections.map((c: any, i: number) => (
                                                                                                    <li key={i} className="text-xs text-slate-700">
                                                                                                        <div className="flex justify-between items-center mb-0.5">
                                                                                                            <span className="font-mono text-slate-400 text-[10px]">{c.id}</span>
                                                                                                        </div>
                                                                                                        <div className="flex items-center gap-1.5 line-through text-slate-400 text-[10px]">
                                                                                                            {c.oldName}
                                                                                                        </div>
                                                                                                        <div className="flex items-center gap-1.5 font-medium text-amber-700">
                                                                                                            <ArrowRightIcon className="w-3 h-3" /> {c.newName}
                                                                                                        </div>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    )}

                                                                                    {syncPreviewData.details.idChanges.length > 0 && (
                                                                                        <div className="bg-white p-3 rounded border border-purple-100 shadow-sm">
                                                                                            <div className="text-xs font-bold text-purple-700 uppercase mb-2">Heal IDs in Tracker ({syncPreviewData.details.idChanges.length})</div>
                                                                                            <ul className="space-y-1">
                                                                                                {syncPreviewData.details.idChanges.map((c: any, i: number) => (
                                                                                                    <li key={i} className="text-xs flex items-center gap-2 text-slate-700">
                                                                                                        <span className="font-medium truncate flex-1">{c.name}</span>
                                                                                                        <div className="flex items-center gap-1 font-mono text-[10px]">
                                                                                                            <span className="text-slate-400">{c.oldId}</span>
                                                                                                            <ArrowRightIcon className="w-2.5 h-2.5 text-purple-400" />
                                                                                                            <span className="text-purple-700 font-bold">{c.newId}</span>
                                                                                                        </div>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    )}

                                                                                    {syncPreviewData.details.duplicatesRemoved.length > 0 && (
                                                                                        <div className="bg-white p-3 rounded border border-red-100 shadow-sm">
                                                                                            <div className="text-xs font-bold text-red-700 uppercase mb-2">Remove Duplicates from Tracker (-{syncPreviewData.details.duplicatesRemoved.length})</div>
                                                                                            <ul className="space-y-1">
                                                                                                {syncPreviewData.details.duplicatesRemoved.map((c: any, i: number) => (
                                                                                                    <li key={i} className="text-xs flex justify-between items-center text-slate-700">
                                                                                                        <div className="flex flex-col">
                                                                                                            <span className="font-medium">{c.name}</span>
                                                                                                            <span className="text-[10px] text-slate-400">Row {c.rowIndex} • {c.id}</span>
                                                                                                        </div>
                                                                                                        <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100">Delete</span>
                                                                                                    </li>
                                                                                                ))}
                                                                                            </ul>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                    </div>

                                                                    <div className="flex gap-3">
                                                                        <button
                                                                            onClick={() => handleSyncDatabase(false)}
                                                                            disabled={syncing}
                                                                            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                                                        >
                                                                            {syncing ? 'Syncing...' : 'Yes, Confirm & Sync'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { setShowSyncPreview(false); setSyncPreviewData(null); }}
                                                                            disabled={syncing}
                                                                            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                                                                    {syncPreviewData.message}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Duplicate Management */}
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-purple-100 rounded-lg">
                                                <CircleStackIcon className="w-6 h-6 text-purple-600" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="text-base font-medium text-slate-900">Duplicate Management</h3>
                                                        <p className="text-sm text-slate-600 mt-1">
                                                            Find companies with identical names but different IDs.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleScanDuplicates}
                                                        disabled={scanning}
                                                        className="px-3 py-1.5 text-sm bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                                                    >
                                                        {scanning ? 'Scanning...' : 'Scan for Duplicates'}
                                                    </button>
                                                </div>

                                                {/* Scan Results */}
                                                {showScanResults && !scanning && (
                                                    <div className="mt-4 space-y-3">
                                                        {duplicates.length === 0 ? (
                                                            <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm">
                                                                No duplicates found! Your database looks clean.
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                <p className="text-sm font-medium text-slate-700">Found {duplicates.length} potential duplicate groups:</p>
                                                                {duplicates.map((group, idx) => (
                                                                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <h4 className="font-medium text-slate-900">{group.name}</h4>
                                                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                                                                                {group.count} records
                                                                            </span>
                                                                        </div>
                                                                        <div className="space-y-1 mb-3">
                                                                            {group.companies.map((c: any) => (
                                                                                <div key={c.id} className="text-xs flex gap-2 text-slate-600">
                                                                                    <span className="font-mono bg-slate-50 px-1 border rounded">{c.id}</span>
                                                                                    <span className={c.status === 'Completed' ? 'text-green-600' : ''}>{c.status || 'No Status'}</span>
                                                                                    {c.pic && <span className="text-slate-400">• {c.pic}</span>}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <button
                                                                            className="w-full py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 transition-colors"
                                                                            onClick={() => setSelectedGroup(group)}
                                                                        >
                                                                            Resolve Conflict
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ID Gap Management */}
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-amber-100 rounded-lg">
                                                <QueueListIcon className="w-6 h-6 text-amber-600" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="text-base font-medium text-slate-900">ID Gap Management</h3>
                                                        <p className="text-sm text-slate-600 mt-1">
                                                            Identify and fix missing company IDs to keep numbering sequential.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleScanIdGaps}
                                                        disabled={gapScanning}
                                                        className="px-3 py-1.5 text-sm bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                                                    >
                                                        {gapScanning ? 'Scanning...' : 'Scan for Gaps'}
                                                    </button>
                                                </div>

                                                {/* Fix Result Message */}
                                                {fixResult && (
                                                    <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${fixResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                                        }`}>
                                                        {fixResult.message}
                                                    </div>
                                                )}

                                                {/* Gap Results */}
                                                {gapResults && (
                                                    <div className="mt-4 space-y-4">
                                                        {gapResults.count === 0 ? (
                                                            <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm flex items-center gap-2">
                                                                <CheckCircleIcon className="w-5 h-5" />
                                                                No gaps found! IDs are sequential from ME-{String(gapResults.minId).padStart(4, '0')} to ME-{String(gapResults.maxId).padStart(4, '0')}.
                                                            </div>
                                                        ) : (
                                                            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                                                                <div className="flex items-start gap-3 mb-4">
                                                                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 mt-0.5" />
                                                                    <div>
                                                                        <h4 className="font-medium text-slate-900">Found {gapResults.count} missing IDs</h4>
                                                                        <p className="text-sm text-slate-600 mt-1">
                                                                            Range: ME-{String(gapResults.minId).padStart(4, '0')} — ME-{String(gapResults.maxId).padStart(4, '0')}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="bg-slate-50 rounded border border-slate-200 p-3 mb-4 max-h-32 overflow-y-auto">
                                                                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">Missing IDs:</p>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {gapResults.missingIds.map(id => (
                                                                            <span key={id} className="text-xs font-mono bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">
                                                                                {id}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                {!showFixConfirm ? (
                                                                    <button
                                                                        onClick={() => setShowFixConfirm(true)}
                                                                        className="text-sm font-medium text-amber-700 hover:text-amber-800 underline"
                                                                    >
                                                                        Fix these gaps (Renumber Companies)
                                                                    </button>
                                                                ) : (
                                                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                                                        <p className="text-sm font-bold text-amber-800 mb-2">Warning: Breaking Change</p>
                                                                        <p className="text-xs text-amber-700 mb-3">
                                                                            This will renumber approximately {gapResults.totalCompanies} companies to close the gaps.
                                                                            Any external links or bookmarks referencing specific Company IDs (e.g. ME-0669) will point to different companies.
                                                                            Data integrity within the app is preserved.
                                                                        </p>
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={handleFixIdGaps}
                                                                                disabled={fixingGaps}
                                                                                className="px-3 py-1.5 text-sm bg-amber-600 text-white font-medium rounded hover:bg-amber-700 transition-colors disabled:opacity-50"
                                                                            >
                                                                                {fixingGaps ? 'Fixing...' : 'Yes, Renumber Companies'}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setShowFixConfirm(false)}
                                                                                disabled={fixingGaps}
                                                                                className="px-3 py-1.5 text-sm bg-white text-slate-700 border border-slate-300 font-medium rounded hover:bg-slate-50 transition-colors"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Company Insertion at Specific ID */}
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-green-100 rounded-lg">
                                                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-base font-medium text-slate-900">Insert Company at Specific ID</h3>
                                                <p className="text-sm text-slate-600 mt-1">
                                                    Add a new company at a specific ID and shift all subsequent companies down.
                                                </p>

                                                {/* Insert Result Message */}
                                                {insertResult && (
                                                    <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${insertResult.success
                                                        ? 'bg-green-50 text-green-700 border border-green-200'
                                                        : 'bg-red-50 text-red-700 border border-red-200'
                                                        }`}>
                                                        {insertResult.message}
                                                    </div>
                                                )}

                                                <div className="mt-4 space-y-3">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                                            Insert at ID (e.g., ME-0042)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={insertIdInput}
                                                            onChange={(e) => setInsertIdInput(e.target.value.toUpperCase())}
                                                            placeholder="ME-0042"
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                                            Company Name *
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={insertCompanyName}
                                                            onChange={(e) => setInsertCompanyName(e.target.value)}
                                                            placeholder="Company Name"
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                                            Discipline (Optional)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={insertDiscipline}
                                                            onChange={(e) => setInsertDiscipline(e.target.value)}
                                                            placeholder="Engineering, Finance, etc."
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                                        />
                                                    </div>

                                                    {!showInsertConfirm ? (
                                                        <button
                                                            onClick={() => {
                                                                if (!insertIdInput || !insertCompanyName) {
                                                                    alert('Please enter both ID and Company Name');
                                                                    return;
                                                                }
                                                                if (!/^ME-\d{4}$/.test(insertIdInput)) {
                                                                    alert('Invalid ID format. Expected ME-XXXX (e.g., ME-0042)');
                                                                    return;
                                                                }
                                                                setShowInsertConfirm(true);
                                                            }}
                                                            disabled={!insertIdInput || !insertCompanyName}
                                                            className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Insert Company
                                                        </button>
                                                    ) : (
                                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                                            <div className="flex items-start gap-2 mb-3">
                                                                <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mt-0.5" />
                                                                <div>
                                                                    <p className="text-sm font-bold text-red-800 mb-1">Critical: Breaking Change</p>
                                                                    <p className="text-xs text-red-700 mb-2">
                                                                        Inserting at {insertIdInput} will shift ALL companies with IDs ≥ {insertIdInput} down by one.
                                                                        This means:
                                                                    </p>
                                                                    <ul className="text-xs text-red-700 list-disc list-inside space-y-1 mb-3">
                                                                        <li>External links to companies will break</li>
                                                                        <li>Bookmarks will point to different companies</li>
                                                                        <li>Data integrity is preserved but IDs change</li>
                                                                    </ul>
                                                                    <p className="text-xs font-semibold text-red-800">
                                                                        You will insert: "{insertCompanyName}" at {insertIdInput}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={handleInsertCompany}
                                                                    disabled={insertingCompany}
                                                                    className="px-3 py-1.5 text-sm bg-red-600 text-white font-medium rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                                                                >
                                                                    {insertingCompany ? 'Inserting...' : 'Yes, Insert and Shift Companies'}
                                                                </button>
                                                                <button
                                                                    onClick={() => setShowInsertConfirm(false)}
                                                                    disabled={insertingCompany}
                                                                    className="px-3 py-1.5 text-sm bg-white text-slate-700 border border-slate-300 font-medium rounded hover:bg-slate-50 transition-colors"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Import Previous Responses */}
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-blue-100 rounded-lg">
                                                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="text-base font-medium text-slate-900">Import Previous Responses</h3>
                                                        <p className="text-sm text-slate-600 mt-1">
                                                            Sync "Previous Response" data from the original manual sheet by matching company names.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleImportPreviousResponses}
                                                        disabled={importingResponses}
                                                        className="px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                    >
                                                        {importingResponses ? 'Importing...' : 'Import Responses'}
                                                    </button>
                                                </div>

                                                {/* Import Result */}
                                                {importResult && (
                                                    <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.success
                                                        ? 'bg-green-50 text-green-700 border border-green-200'
                                                        : 'bg-red-50 text-red-700 border border-red-200'
                                                        }`}>
                                                        <p className="font-medium mb-2">{importResult.message}</p>
                                                        {importResult.success && importResult.stats && (
                                                            <div className="text-xs space-y-1">
                                                                <p>• Total companies in original sheet: {importResult.stats.totalInOriginal}</p>
                                                                <p>• Successfully matched: {importResult.stats.matched}</p>
                                                                {importResult.stats.totalUnmatched > 0 && (
                                                                    <p className="text-amber-700">• Not found in tracker: {importResult.stats.totalUnmatched}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save Button (Hide for Data tab if no general settings to save there) */}
                        {activeTab !== 'data' && (
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                                {saved && (
                                    <div className="flex items-center gap-2 text-green-700">
                                        <CheckCircleIcon className="w-5 h-5" />
                                        <span className="text-sm font-medium">Changes saved</span>
                                    </div>
                                )}
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Modals */}
            <DuplicateMergeModal
                isOpen={!!selectedGroup}
                onClose={() => setSelectedGroup(null)}
                group={selectedGroup}
                onMergeComplete={() => {
                    handleScanDuplicates(); // Refresh scan results
                    setSelectedGroup(null);
                }}
            />
        </Layout>
    );
}

export default function Settings() {
    return (
        <AdminRoute>
            <SettingsContent />
        </AdminRoute>
    );
}
