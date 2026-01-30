import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import {
    ArrowLeftIcon,
    FlagIcon,
    ClockIcon,
    UserCircleIcon,
    PhoneIcon,
    EnvelopeIcon,
    PlusIcon,
    ChatBubbleBottomCenterTextIcon,
    PencilSquareIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { useCurrentUser } from '../../contexts/CurrentUserContext';

interface Contact {
    id: string;
    rowNumber?: number;
    name: string;
    phone?: string;
    email?: string;
    role?: string;
    linkedin?: string;
    remark?: string;
}

interface HistoryEntry {
    id: string;
    timestamp: string;
    user: string;
    action: string;
    remark?: string;
}

interface Company {
    id: string;
    companyName: string;
    name?: string;
    status: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    remark?: string;
    history?: any[];
    discipline?: string;
    priority?: string;
}

const statusOptions = ['To Contact', 'Contacted', 'Negotiating', 'Closed', 'Rejected'];
const disciplineOptions = [
    'Mechanical Engineering',
    'Electrical Engineering',
    'Chemical Engineering',
    'Civil Engineering',
    'Software Engineering',
    'Business / Marketing',
    'General',
];
const priorityOptions = ['High', 'Medium', 'Low'];

export default function CompanyDetailPage() {
    const router = useRouter();
    const { id } = router.query;
    const { user } = useCurrentUser();
    const currentUser = user?.name ?? 'Committee Member';

    const [company, setCompany] = useState<Company | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [activeTab, setActiveTab] = useState<'details' | 'contacts' | 'history'>('details');
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [status, setStatus] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isFlagged, setIsFlagged] = useState(false);
    const [discipline, setDiscipline] = useState('');
    const [priority, setPriority] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showAddContact, setShowAddContact] = useState(false);
    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '' });

    const companyId = typeof id === 'string' ? decodeURIComponent(id) : '';

    const fetchData = async () => {
        try {
            const res = await fetch('/api/data');
            const data = await res.json();
            const companies: Company[] = data.companies || [];
            const found = companies.find(c => c.id === companyId || c.companyName === companyId);
            if (found) {
                setCompany(found);
                setEditedName(found.companyName || found.name || '');
                setStatus(found.status);
                setIsFlagged(found.isFlagged);
                setDiscipline(found.discipline || '');
                setPriority(found.priority || '');
                setAssignedTo(found.pic || 'Unassigned');
            } else {
                setNotFound(true);
            }
        } catch (err) {
            console.error('Failed to load company', err);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (companyId) fetchData();
    }, [companyId]);

    useEffect(() => {
        if (company) {
            setEditedName(company.companyName || company.name || '');
            setStatus(company.status);
            setIsFlagged(company.isFlagged);
            setDiscipline(company.discipline || '');
            setPriority(company.priority || '');
            setAssignedTo(company.pic || 'Unassigned');
        }
    }, [company]);

    const contacts: Contact[] = (company?.contacts || []).map((c: any) => ({
        ...c,
        name: c.name ?? c.picName ?? ''
    }));
    const history: HistoryEntry[] = company?.history || [];

    const handleSave = async () => {
        if (!company) return;
        setIsSaving(true);
        try {
            const updates: any = {
                status,
                isFlagged,
                remark: remarks.trim() || undefined
            };
            if (isEditMode) {
                updates.companyName = editedName;
                updates.discipline = discipline;
                updates.priority = priority;
                updates.pic = assignedTo;
            }
            const res = await fetch('/api/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldCompanyName: company.companyName || company.name,
                    updates,
                    user: currentUser,
                    remark: updates.remark
                })
            });
            if (res.ok) {
                await fetchData();
                setRemarks('');
                setIsEditMode(false);
            } else {
                console.error('Failed to save');
            }
        } catch (error) {
            console.error('Failed to save', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateContact = async (rowNumber: number, updates: any) => {
        if (!company) return;
        try {
            const res = await fetch('/api/update-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rowNumber,
                    updates,
                    companyName: company.companyName || company.name,
                    user: currentUser
                })
            });
            if (res.ok) await fetchData();
            else console.error('Failed to update contact');
        } catch (error) {
            console.error('Error updating contact:', error);
        }
    };

    const handleContactAction = async (contact?: Contact) => {
        if (editingContactId && contact && contact.rowNumber) {
            setIsSaving(true);
            try {
                await handleUpdateContact(contact.rowNumber, {
                    picName: newContact.name,
                    email: newContact.email,
                    phone: newContact.phone,
                    linkedin: newContact.linkedin,
                    remark: newContact.remark
                });
                setEditingContactId(null);
                setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '' });
            } finally {
                setIsSaving(false);
            }
        } else if (newContact.name) {
            console.log('Add contact:', newContact);
            setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '' });
            setShowAddContact(false);
        }
    };

    const startEditingContact = (contact: Contact) => {
        setEditingContactId(contact.id);
        setNewContact({
            name: contact.name,
            phone: contact.phone || '',
            email: contact.email || '',
            role: contact.role || '',
            linkedin: contact.linkedin || '',
            remark: contact.remark || ''
        });
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        try {
            return new Date(dateString).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateString;
        }
    };

    const getStatusColor = (s: string) => {
        const colors: Record<string, string> = {
            'To Contact': 'bg-slate-100 text-slate-700',
            'Contacted': 'bg-blue-100 text-blue-700',
            'Negotiating': 'bg-amber-100 text-amber-700',
            'Closed': 'bg-green-100 text-green-700',
            'Rejected': 'bg-red-100 text-red-700'
        };
        return colors[s] || 'bg-slate-100 text-slate-700';
    };

    if (loading) {
        return (
            <Layout title="Company | Outreach Tracker">
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4" />
                    <p className="text-slate-600 font-medium">Loading company...</p>
                </div>
            </Layout>
        );
    }

    if (notFound || !company) {
        return (
            <Layout title="Company Not Found | Outreach Tracker">
                <div className="text-center py-16">
                    <h2 className="text-xl font-semibold text-slate-900 mb-2">Company not found</h2>
                    <p className="text-slate-600 mb-6">The company you're looking for may have been removed or the link is invalid.</p>
                    <Link
                        href="/companies"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                        Back to All Companies
                    </Link>
                </div>
            </Layout>
        );
    }

    const tabs = [
        { id: 'details' as const, label: 'Details', icon: ChatBubbleBottomCenterTextIcon },
        { id: 'contacts' as const, label: 'Contacts', icon: UserCircleIcon },
        { id: 'history' as const, label: 'History', icon: ClockIcon }
    ];

    return (
        <Layout title={`${company.companyName || company.name} | Outreach Tracker`}>
            <div className="max-w-4xl mx-auto">
                {/* Back link */}
                <Link
                    href="/companies"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to All Companies
                </Link>

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                {isEditMode ? (
                                    <input
                                        type="text"
                                        value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        className="text-2xl font-bold bg-white/20 text-white border-b border-white/40 focus:outline-none focus:border-white px-2 py-1 rounded"
                                    />
                                ) : (
                                    <h1 className="text-2xl font-bold text-white truncate">
                                        {company.companyName || company.name}
                                    </h1>
                                )}
                                {isFlagged && <FlagIcon className="w-6 h-6 text-red-400 flex-shrink-0" aria-label="Flagged" />}
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(company.status)}`}>
                                    {company.status}
                                </span>
                                <span className="text-sm text-blue-100">Assigned to {company.pic || 'Unassigned'}</span>
                                <button
                                    type="button"
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-200 hover:text-white transition-colors"
                                >
                                    <PencilSquareIcon className="w-4 h-4" />
                                    {isEditMode ? 'View Mode' : 'Edit Company Details'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-slate-200 bg-slate-50 rounded-b-xl overflow-hidden">
                    <nav className="flex px-6" aria-label="Tabs">
                        {tabs.map((tab) => {
                            const TabIcon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                                        }`}
                                >
                                    <TabIcon className="w-5 h-5" aria-hidden="true" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Content */}
                <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl shadow-sm px-6 py-6">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-2">Update Status</label>
                                <select
                                    id="status"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {statusOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                            {company.remark && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Latest Remark</label>
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 italic">
                                        "{company.remark}"
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor="remarks" className="block text-sm font-medium text-slate-700 mb-2">Add Remark</label>
                                <textarea
                                    id="remarks"
                                    rows={4}
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    placeholder="Add context about this update..."
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>
                            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <input
                                    type="checkbox"
                                    id="flagged"
                                    checked={isFlagged}
                                    onChange={(e) => setIsFlagged(e.target.checked)}
                                    className="mt-1 w-4 h-4 text-red-600 border-red-300 rounded focus:ring-red-500"
                                />
                                <div className="flex-1">
                                    <label htmlFor="flagged" className="block text-sm font-medium text-red-900 cursor-pointer">Request Attention</label>
                                    <p className="text-xs text-red-700 mt-1">Flag this company for lead/advisor help</p>
                                </div>
                                <FlagIcon className="w-5 h-5 text-red-600 flex-shrink-0" aria-hidden="true" />
                            </div>
                            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Discipline</label>
                                    {isEditMode ? (
                                        <select
                                            value={discipline}
                                            onChange={(e) => setDiscipline(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        >
                                            {disciplineOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    ) : (
                                        <p className="text-sm font-medium text-slate-900">{company.discipline || 'N/A'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Priority</label>
                                    {isEditMode ? (
                                        <select
                                            value={priority}
                                            onChange={(e) => setPriority(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        >
                                            {priorityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    ) : (
                                        <p className="text-sm font-medium text-slate-900">{company.priority || 'N/A'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Assigned To</label>
                                    {isEditMode ? (
                                        <input
                                            type="text"
                                            value={assignedTo}
                                            onChange={(e) => setAssignedTo(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="PIC Name"
                                        />
                                    ) : (
                                        <p className="text-sm font-medium text-slate-900">{company.pic || 'Unassigned'}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'contacts' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-600">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddContact(!showAddContact);
                                        setEditingContactId(null);
                                        setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '' });
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                                >
                                    <PlusIcon className="w-4 h-4" /> Add Contact
                                </button>
                            </div>
                            {(showAddContact || editingContactId) && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                                    <h4 className="font-medium text-slate-900 text-sm">{editingContactId ? 'Edit Contact' : 'New Contact'}</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            placeholder="Name *"
                                            value={newContact.name}
                                            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Role"
                                            value={newContact.role}
                                            onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="tel"
                                            placeholder="Phone"
                                            value={newContact.phone}
                                            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={newContact.email}
                                            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="LinkedIn URL"
                                        value={newContact.linkedin}
                                        onChange={(e) => setNewContact({ ...newContact, linkedin: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    />
                                    <textarea
                                        placeholder="Contact-specific remarks..."
                                        value={newContact.remark}
                                        onChange={(e) => setNewContact({ ...newContact, remark: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleContactAction(contacts.find(c => c.id === editingContactId))}
                                            disabled={isSaving}
                                            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {isSaving ? 'Saving...' : editingContactId ? 'Update Contact' : 'Save Contact'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowAddContact(false); setEditingContactId(null); }}
                                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-3">
                                {contacts.map((contact) => (
                                    <div key={contact.id} className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 group">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-slate-900">{contact.name}</h4>
                                                    {contact.role && <span className="text-xs text-slate-500 py-0.5 px-2 bg-slate-100 rounded-full">{contact.role}</span>}
                                                </div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                                    {contact.phone && <div className="text-sm text-slate-600 flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{contact.phone}</div>}
                                                    {contact.email && <div className="text-sm text-slate-600 flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{contact.email}</div>}
                                                </div>
                                                {contact.remark && <p className="text-xs text-slate-500 mt-2 italic">"{contact.remark}"</p>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => startEditingContact(contact)}
                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100"
                                                title="Edit Contact"
                                            >
                                                <PencilSquareIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            {history.length === 0 ? (
                                <div className="text-center py-12">
                                    <ClockIcon className="mx-auto w-12 h-12 text-slate-300 mb-3" />
                                    <p className="text-sm text-slate-600">No history yet</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((entry) => (
                                        <div key={entry.id} className="relative pl-8 pb-4 border-l-2 border-slate-200 last:border-l-0 last:pb-0">
                                            <div className="absolute left-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white" />
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-slate-900">{entry.user}</span>
                                                <span className="text-xs text-slate-500">• {formatDate(entry.timestamp)}</span>
                                            </div>
                                            <p className="text-sm text-slate-700">{entry.action}</p>
                                            {entry.remark && (
                                                <p className="text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">"{entry.remark}"</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-end gap-3">
                        <Link
                            href="/companies"
                            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                        >
                            Cancel
                        </Link>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`inline-flex items-center gap-2 px-6 py-2 text-sm font-medium rounded-lg ${isEditMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'
                                } text-white disabled:opacity-50`}
                        >
                            {isSaving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                            {isEditMode ? 'Save All Changes' : 'Update Status'}
                        </button>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
