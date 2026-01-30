import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
    Cog6ToothIcon,
    UserCircleIcon,
    BellIcon,
    ShieldCheckIcon,
    PaintBrushIcon,
    CheckCircleIcon
} from '@heroicons/react/24/solid';
import { useCurrentUser } from '../contexts/CurrentUserContext';

export default function Settings() {
    const { user } = useCurrentUser();
    const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'appearance'>('profile');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

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

    const tabs = [
        { id: 'profile', label: 'Profile', icon: UserCircleIcon },
        { id: 'notifications', label: 'Notifications', icon: BellIcon },
        { id: 'security', label: 'Security', icon: ShieldCheckIcon },
        { id: 'appearance', label: 'Appearance', icon: PaintBrushIcon }
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
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                                        isActive
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
                                                    className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                                                        appearance.theme === theme
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

                        {/* Save Button */}
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
                    </div>
                </div>
            </div>
        </Layout>
    );
}
