import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';
import Layout from '../components/Layout';
import AllCompaniesTable from '../components/AllCompaniesTable';
import ConfirmModal from '../components/ConfirmModal';
import AddCompanyModal from '../components/AddCompanyModal';
import { TableCellsIcon, PlusIcon } from '@heroicons/react/24/outline';
import { disciplineToDisplay } from '../lib/discipline-mapping';

interface Company {
    id: string;
    companyName: string;
    name?: string;
    status: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    history?: any[];
    discipline?: string;
    targetSponsorshipTier?: string;
    lastCompanyActivity?: string;
}

interface CommitteeMember {
    name: string;
    email: string;
    role: string;
}

export default function CompaniesPage() {
    const router = useRouter();
    const { user, effectiveIsAdmin } = useCurrentUser();
    const [data, setData] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [pendingAssignment, setPendingAssignment] = useState<{ assignee: string } | null>(null);
    const [selectedAssignee, setSelectedAssignee] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorTitle, setErrorTitle] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
    const { addTask, completeTask, failTask } = useBackgroundTasks();

    const showError = (title: string, message: string) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setShowErrorModal(true);
    };

    const fetchData = async (forceRefresh = false) => {
        setLoading(true);
        const taskId = forceRefresh ? addTask('Refreshing company list...') : null;
        console.log('Fetching data...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
            const res = await fetch(`/api/data${forceRefresh ? '?refresh=true' : ''}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Failed to fetch: ${res.status} ${text}`);
            }

            const responseData = await res.json();
            setData(responseData.companies || []);
            if (taskId) completeTask(taskId, 'Data refreshed');
        } catch (err) {
            clearTimeout(timeoutId);
            if ((err as any).name === 'AbortError') {
                if (taskId) failTask(taskId, 'Refresh timed out');
                showError("Timeout", "The request took too long. The Google Sheets API might be slow. Please try refreshing.");
            } else {
                if (taskId) failTask(taskId, 'Refresh failed');
                showError("Load Error", "Failed to load company data. Please check your connection or try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchCommitteeMembers = async () => {
        try {
            const res = await fetch('/api/committee-members');
            const responseData = await res.json();
            setCommitteeMembers(responseData.members || []);
        } catch (err) {
            console.error('Failed to load committee members', err);
        }
    };

    useEffect(() => {
        fetchData();
        if (effectiveIsAdmin) {
            fetchCommitteeMembers();
        }
    }, [user, effectiveIsAdmin]);

    // Transform data for AllCompaniesTable component
    const transformedCompanies = data.map(company => ({
        id: company.id,
        name: company.companyName || company.name || '',
        status: company.status,
        assignedTo: company.pic || 'Unassigned',
        contact: company.contacts?.map(c => c.name).filter(name => name && name.trim() !== '' && name !== 'N/A').join(', ') || '',
        email: company.contacts?.map(c => c.email).filter(Boolean).join(', ') || '',
        lastUpdated: company.lastUpdated || company.lastCompanyActivity || '',
        isFlagged: company.isFlagged,
        discipline: company.discipline || '',
        targetSponsorshipTier: company.targetSponsorshipTier || ''
    }));

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}`);
    };

    const handleBulkAssign = async (assignee: string) => {
        if (!assignee || selectedCompanies.size === 0 || !user?.isAdmin) return;

        // Validation for Unassignment
        if (assignee === '__UNASSIGN__') {
            const invalidCompanies = Array.from(selectedCompanies).filter(id => {
                const company = data.find(c => c.id === id);
                return company && company.status !== 'To Contact';
            });

            if (invalidCompanies.length > 0) {
                showError(
                    "Action Restricted",
                    "Unassignment is only allowed for companies with 'To Contact' status.\n\nFor other statuses, please reassign to a new PIC."
                );
                setSelectedAssignee(''); // Reset dropdown
                return;
            }
        }

        // Store pending assignment and show modal
        setPendingAssignment({ assignee });
        setShowConfirmModal(true);
    };

    const confirmBulkAssign = async () => {
        if (!pendingAssignment || selectedCompanies.size === 0) return;

        const { assignee } = pendingAssignment;
        const companiesToUpdate = Array.from(selectedCompanies);

        // 1. Optimistic Update (Immediate Feedback)
        const timestamp = new Date().toISOString();
        const valueToSet = assignee === '__UNASSIGN__' ? '' : assignee;

        // Immediately update local state
        setData(prevData => prevData.map(c => {
            if (selectedCompanies.has(c.id)) {
                return {
                    ...c,
                    pic: valueToSet,
                    lastUpdated: timestamp,
                    // Ensure lastCompanyActivity is updated if logic requires it for sorting
                    lastCompanyActivity: c.lastCompanyActivity || timestamp
                };
            }
            return c;
        }));

        // 2. Clear UI state immediately
        const actionText = assignee === '__UNASSIGN__' ? 'unassigned' : 'assigned';
        const targetText = assignee === '__UNASSIGN__' ? '' : ` to ${assignee}`;
        const count = companiesToUpdate.length;

        setSuccessMessage(`Successfully ${actionText} ${count} ${count === 1 ? 'company' : 'companies'}${targetText}`);
        setShowSuccessModal(true);
        setSelectedCompanies(new Set());
        setLastSelectedIndex(null);
        setShowConfirmModal(false);
        setPendingAssignment(null);
        // Note: We deliberately skip setIsAssigning(true) to avoid blocking the UI

        // 3. Background API Call
        const taskId = addTask(`Syncing assignment for ${count} ${count === 1 ? 'company' : 'companies'}...`);
        try {
            const response = await fetch('/api/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyIds: companiesToUpdate,
                    assignee,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Server error');
            }

            // Optionally refresh silently to ensure exact consistency (e.g. if server formatted dates differently)
            fetchData();
            completeTask(taskId, 'Changes saved successfully to Google Sheets');
        } catch (error) {
            console.error('Background sync failed:', error);
            // 4. Error Handling (Revert)
            failTask(taskId, 'Failed to save to server');
            setShowSuccessModal(false); // Hide success if it's still open
            showError(
                "Sync Error",
                "The update appeared to succeed but failed to save to the server. reloading data..."
            );
            fetchData(); // Force reload to revert to correct server state
        }
    };

    if (loading && data.length === 0) {
        return (
            <Layout title="All Companies | Outreach Tracker">
                <div className="flex flex-col items-center justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-500 font-medium">Loading company database...</p>
                    <p className="text-gray-400 text-sm mt-1">Fetching latest data from Google Sheets</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="All Companies | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
                            <TableCellsIcon className="w-6 h-6 text-white" aria-hidden="true" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">All Companies</h1>
                            <p className="text-slate-600 mt-1">Browse and manage the complete company database</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchData(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-lg font-medium hover:bg-slate-50 transition-colors shadow-sm"
                            title="Fetch latest data from Google Sheets"
                        >
                            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                        {user?.isCommitteeMember && (
                            <button
                                onClick={() => setShowAddCompanyModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                <PlusIcon className="w-5 h-5" />
                                Add Company
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table Content */}
            <AllCompaniesTable
                companies={transformedCompanies}
                onCompanyClick={handleCompanyClick}
                selectedCompanies={selectedCompanies}
                onSelectionChange={setSelectedCompanies}
                lastSelectedIndex={lastSelectedIndex}
                onLastSelectedIndexChange={setLastSelectedIndex}
            />

            {/* Bulk Action Bar */}
            {effectiveIsAdmin && selectedCompanies.size > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-4 z-50 border border-blue-500">
                    {/* Selection Counter */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-700 rounded-md">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <span className="font-semibold text-lg">{selectedCompanies.size}</span>
                        <span className="text-blue-100">
                            {selectedCompanies.size === 1 ? 'company' : 'companies'} selected
                        </span>
                    </div>

                    {/* Assign Dropdown & Button */}
                    <div className="flex items-center gap-2">
                        <select
                            className="px-4 py-2 bg-white text-slate-900 rounded-lg font-medium border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={selectedAssignee}
                            onChange={(e) => setSelectedAssignee(e.target.value)}
                        >
                            <option value="">Select Assignee...</option>
                            <option value="__UNASSIGN__" className="text-red-600 font-medium">Unassign (Clear PIC)</option>
                            <hr />
                            {committeeMembers.map(member => (
                                <option key={member.name} value={member.name}>{member.name}</option>
                            ))}
                        </select>

                        <button
                            onClick={() => handleBulkAssign(selectedAssignee)}
                            disabled={!selectedAssignee}
                            className={`px-4 py-2 rounded-lg font-bold transition-all transform active:scale-95 ${selectedAssignee
                                ? 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                                : 'bg-blue-800 text-blue-300 cursor-not-allowed'
                                }`}
                        >
                            Assign
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="h-8 w-px bg-blue-400 mx-2"></div>

                    {/* Clear Selection Button */}
                    <button
                        onClick={() => {
                            setSelectedCompanies(new Set());
                            setLastSelectedIndex(null);
                        }}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Clear
                    </button>
                </div>
            )}

            {/* Shift-click Hint */}
            {effectiveIsAdmin && selectedCompanies.size > 0 && (
                <div className="mt-4 text-sm text-slate-600 text-center pb-20">
                    💡 Tip: Hold <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Shift</kbd> and click to select a range
                </div>
            )}

            {/* Confirmation Modal */}
            <ConfirmModal
                isOpen={showConfirmModal}
                onClose={() => {
                    setShowConfirmModal(false);
                    setPendingAssignment(null);
                }}
                onConfirm={confirmBulkAssign}
                title={pendingAssignment?.assignee === '__UNASSIGN__' ? "Confirm Unassignment" : "Confirm Bulk Assignment"}
                message={pendingAssignment?.assignee === '__UNASSIGN__'
                    ? `Are you sure you want to remove the assigned PIC from ${selectedCompanies.size} ${selectedCompanies.size === 1 ? 'company' : 'companies'}?`
                    : `Are you sure you want to assign ${selectedCompanies.size} ${selectedCompanies.size === 1 ? 'company' : 'companies'} to ${pendingAssignment?.assignee}?`
                }
                confirmText={pendingAssignment?.assignee === '__UNASSIGN__' ? "Unassign" : "Assign"}
                cancelText="Cancel"
                variant={pendingAssignment?.assignee === '__UNASSIGN__' ? "danger" : "warning"}
                isLoading={isAssigning}
            />

            {/* Success Modal */}
            <ConfirmModal
                isOpen={showSuccessModal}
                onClose={() => setShowSuccessModal(false)}
                onConfirm={() => setShowSuccessModal(false)}
                title="Assignment Successful"
                message={successMessage}
                confirmText="Done"
                cancelText="Close"
                variant="success"
            />

            {/* Error Modal */}
            <ConfirmModal
                isOpen={showErrorModal}
                onClose={() => setShowErrorModal(false)}
                onConfirm={() => setShowErrorModal(false)}
                title={errorTitle}
                message={errorMessage}
                confirmText="OK"
                showCancel={false}
                variant="danger"
            />

            {/* Add Company Modal */}
            <AddCompanyModal
                isOpen={showAddCompanyModal}
                onClose={() => setShowAddCompanyModal(false)}
                onSuccess={() => {
                    fetchData(); // Refresh the company list
                    setSuccessMessage('Company added successfully!');
                    setShowSuccessModal(true);
                }}
                committeeMembers={committeeMembers}
            />
        </Layout>
    );
}
