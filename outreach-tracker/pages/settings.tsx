import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import Layout from '../components/Layout';
import {
    Cog6ToothIcon,
    UserCircleIcon,
    BellIcon,
    ShieldCheckIcon,
    PaintBrushIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    XMarkIcon,
    AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/solid';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import DuplicateMergeModal from '../components/DuplicateMergeModal';
import AdminRoute from '../components/AdminRoute';

function SettingsContent() {
    const router = useRouter();
    const { user, realUser } = useCurrentUser();
    const isSuperAdmin = realUser?.isSuperAdmin === true;
    const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'appearance' | 'limits'>('profile');

    useEffect(() => {
        const tab = router.query.tab as string | undefined;
        if (tab && ['profile', 'notifications', 'security', 'appearance', 'limits'].includes(tab)) {
            setActiveTab(tab as typeof activeTab);
        }
    }, [router.query.tab]);
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

    // Audit Recovery States
    const [auditScanning, setAuditScanning] = useState(false);
    const [auditMismatches, setAuditMismatches] = useState<any[]>([]);
    const [auditApplying, setAuditApplying] = useState(false);
    const [auditResult, setAuditResult] = useState<{ success: boolean; message: string } | null>(null);
    const [auditWarning, setAuditWarning] = useState<string | null>(null);

    // ID Gap States
    const [gapScanning, setGapScanning] = useState(false);
    const [gapResults, setGapResults] = useState<{ count: number; missingIds: string[]; minId: number; maxId: number; totalCompanies: number; proposedChanges?: Array<{ oldId: string; newId: string; name: string }>; operationId?: string; impactSummary?: { dbRowsAffected: number; trackerRowsAffected: number; scheduleRowsAffected: number; threadHistoryRowsAffected: number } } | null>(null);
    const [fixingGaps, setFixingGaps] = useState(false);
    const [showRenumberPreview, setShowRenumberPreview] = useState(false);
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

    // Row Reorder States
    const [reordering, setReordering] = useState(false);
    const [reorderResult, setReorderResult] = useState<{ success: boolean; message: string } | null>(null);

    // Limits States
    const [limits, setLimits] = useState<any[]>([]);
    const [loadingLimits, setLoadingLimits] = useState(false);
    const [savingLimits, setSavingLimits] = useState(false);
    const [limitsResult, setLimitsResult] = useState<{ success: boolean; message: string } | null>(null);

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

    // Fetch limits when tab becomes active
    useEffect(() => {
        if (activeTab === 'limits' && limits.length === 0) {
            const fetchLimits = async () => {
                setLoadingLimits(true);
                try {
                    const res = await fetch('/api/limits');
                    const data = await res.json();
                    if (data.limits) {
                        setLimits(data.limits);
                    }
                } catch (error) {
                    console.error('Failed to fetch limits', error);
                } finally {
                    setLoadingLimits(false);
                }
            };
            fetchLimits();
        }
    }, [activeTab, limits.length]);

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
                    const { added, addedToDatabase, updated, duplicatesRemoved, idNameMismatchesCount = 0 } = data.stats;
                    let msg = `Sync complete: Added ${added} to tracker, ${addedToDatabase} to database, updated ${updated} companies, and removed ${duplicatesRemoved} duplicates.`;
                    if (idNameMismatchesCount > 0) {
                        msg += ` ${idNameMismatchesCount} ID/name mismatch(es) flagged for manual review.`;
                    }
                    setSyncResult({
                        success: true,
                        message: msg,
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
        setShowRenumberPreview(false);
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
        const operationId = gapResults?.operationId;
        if (!operationId) {
            setFixResult({ success: false, message: 'No preview available. Run ID gap scan first to get operation ID.' });
            return;
        }
        setFixingGaps(true);
        setFixResult(null);
        try {
            const res = await fetch('/api/id-gaps/fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId }),
            });
            const data = await res.json();
            if (data.success) {
                setFixResult({ success: true, message: `Successfully renumbered ${data.totalRenumbered} companies to close gaps.` });
                setGapResults(null);
                setShowFixConfirm(false);
            } else {
                setFixResult({ success: false, message: data.message || 'Failed to fix gaps.' });
            }
        } catch (error) {
            setFixResult({ success: false, message: 'An error occurred.' });
        } finally {
            setFixingGaps(false);
        }
    };

    const handleAuditScan = async () => {
        setAuditScanning(true);
        setAuditResult(null);
        setAuditMismatches([]);
        setAuditWarning(null);
        try {
            const res = await fetch('/api/audit-recover-ids');
            const data = await res.json();
            if (data.success) {
                setAuditMismatches(data.mismatches || []);
                setAuditWarning(data.warning || null);
                if (!data.mismatches?.length) {
                    setAuditResult({ success: true, message: `No ID/name mismatches found. Audited ${data.companiesScanned} companies using logs.` });
                }
            } else {
                setAuditResult({ success: false, message: data.message || 'Audit scan failed.' });
            }
        } catch (error) {
            setAuditResult({ success: false, message: 'An error occurred during audit scan.' });
        } finally {
            setAuditScanning(false);
        }
    };

    const handleAuditApply = async (corrections: Array<{ rowIndex: number; newName: string }>) => {
        setAuditApplying(true);
        setAuditResult(null);
        try {
            const res = await fetch('/api/audit-recover-ids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ corrections }),
            });
            const data = await res.json();
            if (data.success) {
                setAuditResult({ success: true, message: `Applied ${data.applied} corrections from audit trail.` });
                setAuditMismatches(prev => prev.filter(m => !corrections.some(c => c.rowIndex === m.rowIndex)));
            } else {
                setAuditResult({ success: false, message: data.message || 'Apply failed.' });
            }
        } catch (error) {
            setAuditResult({ success: false, message: 'An error occurred.' });
        } finally {
            setAuditApplying(false);
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
                setImportResult({ success: false, message: data.message || 'Import failed.' });
            }
        } catch (error) {
            setImportResult({ success: false, message: 'An error occurred during import.' });
        } finally {
            setImportingResponses(false);
        }
    };

    const handleReorderRows = async () => {
        setReordering(true);
        setReorderResult(null);
        try {
            const res = await fetch('/api/reorder-rows', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setReorderResult({
                    success: true,
                    message: data.message
                });
            } else {
                setReorderResult({ success: false, message: data.message || 'Reorder failed.' });
            }
        } catch (error) {
            setReorderResult({ success: false, message: 'An error occurred during reordering.' });
        } finally {
            setReordering(false);
        }
    };

    const handleSaveLimits = async () => {
        setSavingLimits(true);
        setLimitsResult(null);
        try {
            const cleanLimits = limits.map(l => ({
                ...l,
                total: l.total === '' ? 0 : Number(l.total),
                daily: l.daily === '' ? 0 : Number(l.daily)
            }));

            const res = await fetch('/api/limits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limits: cleanLimits })
            });
            const data = await res.json();
            if (data.success) {
                setLimitsResult({ success: true, message: 'Limits saved successfully.' });
            } else {
                setLimitsResult({ success: false, message: data.message || 'Failed to save limits.' });
            }
        } catch (error) {
            setLimitsResult({ success: false, message: 'An error occurred while saving.' });
        } finally {
            setSavingLimits(false);
            // Hide message after 3s
            setTimeout(() => setLimitsResult(null), 3000);
        }
    };

    const tabs = [
        { id: 'profile', label: 'Profile', icon: UserCircleIcon },
        { id: 'notifications', label: 'Notifications', icon: BellIcon },
        { id: 'security', label: 'Security', icon: ShieldCheckIcon },
        { id: 'appearance', label: 'Appearance', icon: PaintBrushIcon },
        { id: 'limits', label: 'Sponsorship Limits', icon: AdjustmentsHorizontalIcon }
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

                        {/* Limits Tab */}
                        {activeTab === 'limits' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-900 mb-1">Sponsorship Limits</h2>
                                    <p className="text-sm text-slate-600">Set maximum capacities for total and daily companies accommodated by tier.</p>
                                </div>

                                <div className="space-y-4">
                                    {loadingLimits ? (
                                        <div className="flex justify-center p-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                                            <table className="min-w-full divide-y divide-slate-200">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tier</th>
                                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Total Limit</th>
                                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Daily Limit</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-slate-200">
                                                    {limits.map((limit, index) => (
                                                        <tr key={limit.tier}>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{limit.tier}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={limit.total}
                                                                    onChange={(e) => {
                                                                        const newLimits = [...limits];
                                                                        const val = e.target.value;
                                                                        newLimits[index].total = val === '' ? '' : (parseInt(val, 10) || 0);
                                                                        setLimits(newLimits);
                                                                    }}
                                                                    className="w-full sm:w-24 px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                />
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={limit.daily}
                                                                    onChange={(e) => {
                                                                        const newLimits = [...limits];
                                                                        const val = e.target.value;
                                                                        newLimits[index].daily = val === '' ? '' : (parseInt(val, 10) || 0);
                                                                        setLimits(newLimits);
                                                                    }}
                                                                    className="w-full sm:w-24 px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {limitsResult && (
                                        <div className={`p-4 rounded-md text-sm ${limitsResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                            {limitsResult.message}
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-4">
                                        <button
                                            onClick={handleSaveLimits}
                                            disabled={loadingLimits || savingLimits}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                        >
                                            {savingLimits && (
                                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            )}
                                            {savingLimits ? 'Saving...' : 'Save Limits'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save Button (Hide for Limits tab as it has its own save mechanism) */}
                        {activeTab !== 'limits' && (
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
