import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';
import Layout from '../components/Layout';
import AllCompaniesTable from '../components/AllCompaniesTable';
import ConfirmModal from '../components/ConfirmModal';
import AddCompanyModal from '../components/AddCompanyModal';
import { TableCellsIcon, PlusIcon } from '@heroicons/react/24/outline';
import { disciplineToDisplay } from '../lib/discipline-mapping';
import {
    calculateTimeSlots,
    getEndTime,
    checkBlockedPeriodWarnings,
    formatTime,
    DEFAULT_SCHEDULE_SETTINGS,
    ScheduleSettings,
} from '../lib/schedule-calculator';

const OUTREACH_STATUSES = ['To Contact', 'Contacted', 'To Follow Up', 'Interested', 'Registered', 'Rejected', 'No Reply'] as const;

const STORAGE_KEY_SELECTION_RESTORE = 'companies_selection_restore';
const STORAGE_KEY_SELECTION = 'companies_selection';
const STORAGE_KEY_LAST_SELECTED_INDEX = 'companies_lastSelectedIndex';

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

    // Email schedule state
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleStartTime, setScheduleStartTime] = useState('');
    const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE_SETTINGS);
    const [isFetchingSlot, setIsFetchingSlot] = useState(false);
    const [projectedSlots, setProjectedSlots] = useState<string[] | null>(null);
    const [scheduleMap, setScheduleMap] = useState<Record<string, { date: string; time: string; isOverdue: boolean }>>({});
    const [isSyncing, setIsSyncing] = useState(false);

    // Bulk set status
    const [selectedStatus, setSelectedStatus] = useState('');
    const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{ status: string } | null>(null);
    const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    const showError = (title: string, message: string) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setShowErrorModal(true);
    };

    // Fetch the next available start time + settings whenever the date changes
    const fetchAvailableSlot = useCallback(async (date: string) => {
        if (!date) return;
        setIsFetchingSlot(true);
        try {
            const res = await fetch(`/api/email-schedule/available-slots?date=${date}`);
            if (res.ok) {
                const json = await res.json();
                setScheduleStartTime(json.nextStartTime || '08:00');
                if (json.settings) setScheduleSettings(json.settings);
            }
        } catch {
            setScheduleStartTime('08:00');
        } finally {
            setIsFetchingSlot(false);
        }
    }, []);

    useEffect(() => {
        if (scheduleDate) fetchAvailableSlot(scheduleDate);
    }, [scheduleDate, fetchAvailableSlot]);

    const count = selectedCompanies.size;
    useEffect(() => {
        if (!scheduleDate || !scheduleStartTime || count === 0) {
            setProjectedSlots(null);
            return;
        }
        let cancelled = false;
        const params = new URLSearchParams({ date: scheduleDate, count: String(count), startTime: scheduleStartTime });
        fetch(`/api/email-schedule/available-slots?${params}`)
            .then(res => res.ok ? res.json() : null)
            .then(json => {
                if (!cancelled && json?.slots?.length === count) {
                    setProjectedSlots(json.slots);
                    if (json.settings) setScheduleSettings(json.settings);
                } else {
                    setProjectedSlots(null);
                }
            })
            .catch(() => setProjectedSlots(null));
        return () => { cancelled = true; };
    }, [scheduleDate, scheduleStartTime, count]);

    const schedulePreview = (() => {
        if (!scheduleDate || !scheduleStartTime || count === 0) return null;
        const slots =
            projectedSlots && projectedSlots.length === count
                ? projectedSlots
                : calculateTimeSlots(
                    scheduleStartTime,
                    count,
                    scheduleSettings.blockedPeriods,
                    scheduleSettings.emailsPerBatch,
                    scheduleSettings.batchIntervalMinutes,
                );
        const endTime = getEndTime(slots);
        const warnings = checkBlockedPeriodWarnings(slots, scheduleSettings.blockedPeriods);
        return { slots, endTime, warnings };
    })();

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

    useEffect(() => {
        if (data.length === 0) return;
        fetch('/api/email-schedule')
            .then(res => res.ok ? res.json() : null)
            .then(json => {
                const now = Date.now();
                const map: Record<string, { date: string; time: string; isOverdue: boolean }> = {};
                const bestTsByCompany: Record<string, number> = {};
                (json?.entries || []).forEach((e: { companyId: string; date: string; time: string; completed?: string }) => {
                    if (!e?.companyId || !e?.date || !e?.time) return;
                    if (e.completed === 'Y') return;
                    const ts = new Date(`${e.date}T${e.time}`).getTime();
                    if (!Number.isFinite(ts)) return;
                    const prev = bestTsByCompany[e.companyId];
                    if (prev === undefined || ts < prev) {
                        bestTsByCompany[e.companyId] = ts;
                        map[e.companyId] = { date: e.date, time: e.time, isOverdue: ts < now };
                    }
                });
                setScheduleMap(map);
            })
            .catch(() => setScheduleMap({}));
    }, [data.length]);

    const hasRestoredSelection = useRef(false);
    useEffect(() => {
        if (typeof window === 'undefined' || data.length === 0 || hasRestoredSelection.current) return;
        hasRestoredSelection.current = true;
        try {
            if (sessionStorage.getItem(STORAGE_KEY_SELECTION_RESTORE) !== '1') return;
            const raw = sessionStorage.getItem(STORAGE_KEY_SELECTION);
            const ids: string[] = raw ? JSON.parse(raw) : [];
            const idSet = new Set(data.map(c => c.id));
            const valid = ids.filter(id => idSet.has(id));
            if (valid.length > 0) {
                setSelectedCompanies(new Set(valid));
            }
            setLastSelectedIndex(null);
            sessionStorage.removeItem(STORAGE_KEY_SELECTION_RESTORE);
            sessionStorage.removeItem(STORAGE_KEY_SELECTION);
            sessionStorage.removeItem(STORAGE_KEY_LAST_SELECTED_INDEX);
        } catch (_) {}
    }, [data]);

    const transformedCompanies = data.map(company => ({
        id: company.id,
        name: company.companyName || company.name || '',
        status: company.status,
        assignedTo: company.pic || 'Unassigned',
        contact: company.contacts?.map(c => {
            const name = c.name;
            if (name && String(name).trim() !== '' && name !== 'N/A') return name;
            return 'n/a';
        }).join(', ') || '',
        email: company.contacts?.map(c => c.email).filter(Boolean).join(', ') || '',
        phone: company.contacts?.flatMap(c => [c.phone, c.landline].filter(Boolean)).join(', ') || '',
        lastUpdated: company.lastUpdated || company.lastCompanyActivity || '',
        isFlagged: company.isFlagged,
        discipline: company.discipline || '',
        targetSponsorshipTier: company.targetSponsorshipTier || '',
        scheduledDate: scheduleMap[company.id]?.date,
        scheduledTime: scheduleMap[company.id]?.time,
        scheduledIsOverdue: scheduleMap[company.id]?.isOverdue,
    }));

    const handleCompanyClick = (companyId: string) => {
        if (typeof window !== 'undefined') {
            try {
                sessionStorage.setItem(STORAGE_KEY_SELECTION, JSON.stringify(Array.from(selectedCompanies)));
                sessionStorage.setItem(STORAGE_KEY_LAST_SELECTED_INDEX, String(lastSelectedIndex ?? ''));
                sessionStorage.setItem(STORAGE_KEY_SELECTION_RESTORE, '1');
            } catch (_) {}
        }
        router.push(`/companies/${encodeURIComponent(companyId)}?from=all`);
    };

    const handleBulkAssign = async (assignee: string) => {
        if (!assignee || selectedCompanies.size === 0 || !user?.isAdmin) return;

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

        // Optimistic schedule map when we have date/time so table shows scheduled slot immediately
        if (scheduleDate && scheduleStartTime && schedulePreview?.slots && assignee !== '__UNASSIGN__') {
            const companyIds = Array.from(selectedCompanies);
            setScheduleMap(prev => {
                const next = { ...prev };
                schedulePreview.slots.forEach((slot, i) => {
                    if (companyIds[i]) next[companyIds[i]] = { date: scheduleDate, time: slot, isOverdue: false };
                });
                return next;
            });
        }

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
        setScheduleDate('');
        setScheduleStartTime('');
        // Note: We deliberately skip setIsAssigning(true) to avoid blocking the UI

        // 3. Background API Call
        const taskId = addTask(`Syncing assignment for ${count} ${count === 1 ? 'company' : 'companies'}...`);
        const companyNames: Record<string, string> = {};
        data.forEach(c => { if (selectedCompanies.has(c.id)) companyNames[c.id] = c.companyName || c.name || c.id; });
        try {
            const response = await fetch('/api/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyIds: companiesToUpdate,
                    assignee,
                    companyNames,
                    ...(scheduleDate && scheduleStartTime ? { scheduleDate, scheduleStartTime } : {}),
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Server error');
            }

            completeTask(taskId, 'Changes saved successfully to Google Sheets');
            // Refetch from sheet so table shows exact server state (PIC, lastUpdated, schedule)
            setIsSyncing(true);
            try {
                const [dataRes, scheduleRes] = await Promise.all([
                    fetch(`/api/data?refresh=true`),
                    fetch('/api/email-schedule'),
                ]);
                if (dataRes.ok) {
                    const json = await dataRes.json();
                    setData(json.companies || []);
                }
                if (scheduleRes.ok) {
                    const json = await scheduleRes.json();
                    const now = Date.now();
                    const map: Record<string, { date: string; time: string; isOverdue: boolean }> = {};
                    const bestTsByCompany: Record<string, number> = {};
                    (json?.entries || []).forEach((e: { companyId: string; date: string; time: string; completed?: string }) => {
                        if (!e?.companyId || !e?.date || !e?.time) return;
                        if (e.completed === 'Y') return;
                        const ts = new Date(`${e.date}T${e.time}`).getTime();
                        if (!Number.isFinite(ts)) return;
                        const prev = bestTsByCompany[e.companyId];
                        if (prev === undefined || ts < prev) {
                            bestTsByCompany[e.companyId] = ts;
                            map[e.companyId] = { date: e.date, time: e.time, isOverdue: ts < now };
                        }
                    });
                    setScheduleMap(map);
                }
            } finally {
                setIsSyncing(false);
            }
        } catch (error) {
            console.error('Background sync failed:', error);
            // 4. Error Handling (Revert)
            failTask(taskId, 'Failed to save to server');
            setShowSuccessModal(false); // Hide success if it's still open
            showError(
                "Sync Error",
                "The update appeared to succeed but failed to save to the server. Reloading data..."
            );
            fetchData(); // Force reload to revert to correct server state
        }
    };

    const handleBulkSetStatus = (status: string) => {
        if (!status || selectedCompanies.size === 0 || !user?.isAdmin) return;
        setPendingStatusUpdate({ status });
        setShowStatusConfirmModal(true);
    };

    const confirmBulkStatusUpdate = async () => {
        if (!pendingStatusUpdate || selectedCompanies.size === 0) return;

        const { status } = pendingStatusUpdate;
        const companiesToUpdate = Array.from(selectedCompanies);
        const count = companiesToUpdate.length;

        setData(prevData => prevData.map(c =>
            selectedCompanies.has(c.id) ? { ...c, status, lastUpdated: new Date().toISOString() } : c
        ));
        setSuccessMessage(`Status set to "${status}" for ${count} ${count === 1 ? 'company' : 'companies'}`);
        setShowSuccessModal(true);
        setSelectedCompanies(new Set());
        setLastSelectedIndex(null);
        setShowStatusConfirmModal(false);
        setPendingStatusUpdate(null);
        setSelectedStatus('');

        const taskId = addTask(`Updating status for ${count} ${count === 1 ? 'company' : 'companies'}...`);
        setIsUpdatingStatus(true);
        try {
            const response = await fetch('/api/bulk-update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyIds: companiesToUpdate, status }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Server error');
            }

            completeTask(taskId, 'Status updated successfully');
            setIsSyncing(true);
            try {
                const dataRes = await fetch('/api/data?refresh=true');
                if (dataRes.ok) {
                    const json = await dataRes.json();
                    setData(json.companies || []);
                }
            } finally {
                setIsSyncing(false);
            }
        } catch (error) {
            console.error('Bulk status update failed:', error);
            failTask(taskId, 'Failed to update status');
            setShowSuccessModal(false);
            showError(
                'Update failed',
                'Status could not be saved to the server. Reloading data…'
            );
            fetchData();
        } finally {
            setIsUpdatingStatus(false);
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
                        {user?.canEditCompanies && (
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

            {/* Syncing progress bar: data is being refetched from sheet after bulk assign */}
            {isSyncing && (
                <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-indigo-800">Syncing with sheet…</p>
                    <div className="flex-1 h-1.5 bg-indigo-100 rounded-full overflow-hidden animate-pulse" />
                </div>
            )}

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
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-[min(96vw,860px)]">
                    <div className="bg-blue-600 text-white px-5 py-4 rounded-xl shadow-2xl border border-blue-500 space-y-3">
                        {/* Row 1: counter + assignee + clear */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Selection Counter */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-700 rounded-md shrink-0">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                                <span className="font-semibold text-lg">{selectedCompanies.size}</span>
                                <span className="text-blue-100">
                                    {selectedCompanies.size === 1 ? 'company' : 'companies'} selected
                                </span>
                            </div>

                            {/* Assignee dropdown */}
                            <select
                                className="flex-1 min-w-[160px] px-3 py-2 bg-white text-slate-900 rounded-lg font-medium border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                                className={`px-4 py-2 rounded-lg font-bold transition-all transform active:scale-95 shrink-0 ${selectedAssignee
                                    ? 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                                    : 'bg-blue-800 text-blue-300 cursor-not-allowed'
                                    }`}
                            >
                                Assign
                            </button>

                            <div className="h-8 w-px bg-blue-400 hidden sm:block"></div>

                            {/* Bulk set outreach status */}
                            <select
                                className="flex-1 min-w-[140px] px-3 py-2 bg-white text-slate-900 rounded-lg font-medium border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                            >
                                <option value="">Set status...</option>
                                {OUTREACH_STATUSES.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleBulkSetStatus(selectedStatus)}
                                disabled={!selectedStatus}
                                className={`px-4 py-2 rounded-lg font-bold transition-all transform active:scale-95 shrink-0 ${selectedStatus
                                    ? 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                                    : 'bg-blue-800 text-blue-300 cursor-not-allowed'
                                    }`}
                            >
                                Set status
                            </button>

                            <div className="h-8 w-px bg-blue-400 hidden sm:block"></div>

                            <button
                                onClick={() => {
                                    setSelectedCompanies(new Set());
                                    setLastSelectedIndex(null);
                                    setScheduleDate('');
                                    setScheduleStartTime('');
                                    setSelectedStatus('');
                                }}
                                className="px-3 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-medium transition-colors flex items-center gap-1.5 shrink-0"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Clear
                            </button>
                        </div>

                        {/* Row 2: optional schedule (only when assigning a real member) */}
                        {selectedAssignee && selectedAssignee !== '__UNASSIGN__' && (
                            <div className="border-t border-blue-500 pt-3 space-y-2">
                                <p className="text-xs font-semibold text-blue-200 uppercase tracking-wide">
                                    Schedule Emails (optional)
                                </p>
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Date picker */}
                                    <div className="flex flex-col gap-0.5">
                                        <label className="text-xs text-blue-200">Send Date</label>
                                        <input
                                            type="date"
                                            value={scheduleDate}
                                            min={new Date().toISOString().slice(0, 10)}
                                            onChange={e => setScheduleDate(e.target.value)}
                                            className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-sm border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>

                                    {/* Start time */}
                                    {scheduleDate && (
                                        <div className="flex flex-col gap-0.5">
                                            <label className="text-xs text-blue-200 flex items-center gap-1">
                                                Start Time
                                                {isFetchingSlot && (
                                                    <span className="text-blue-300 text-[10px]">(loading...)</span>
                                                )}
                                            </label>
                                            <input
                                                type="time"
                                                value={scheduleStartTime}
                                                onChange={e => setScheduleStartTime(e.target.value)}
                                                className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-sm border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                            />
                                        </div>
                                    )}

                                    {/* End time preview */}
                                    {schedulePreview?.endTime && (
                                        <div className="flex flex-col gap-0.5">
                                            <label className="text-xs text-blue-200">End Time</label>
                                            <div className="px-3 py-1.5 bg-blue-700 rounded-lg text-sm font-medium">
                                                {formatTime(schedulePreview.endTime)}
                                            </div>
                                        </div>
                                    )}

                                    {/* Rate info */}
                                    {scheduleDate && scheduleStartTime && (
                                        <div className="text-xs text-blue-200 self-end pb-1.5">
                                            {scheduleSettings.emailsPerBatch} emails / {scheduleSettings.batchIntervalMinutes} min
                                        </div>
                                    )}
                                </div>

                                {/* Warnings */}
                                {schedulePreview && schedulePreview.warnings.length > 0 && (
                                    <div className="flex flex-col gap-1 mt-1">
                                        {schedulePreview.warnings.map((w, i) => (
                                            <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-500/20 border border-amber-400/40 rounded-lg text-xs text-amber-200">
                                                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                {w.message}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Green confirmation when clean */}
                                {scheduleDate && scheduleStartTime && schedulePreview && schedulePreview.warnings.length === 0 && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 border border-green-400/40 rounded-lg text-xs text-green-200">
                                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Schedule looks good — {selectedCompanies.size} emails from {formatTime(scheduleStartTime)} to {schedulePreview.endTime ? formatTime(schedulePreview.endTime) : '—'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Shift-click Hint */}
            {effectiveIsAdmin && selectedCompanies.size > 0 && (
                <div className="mt-4 text-sm text-slate-600 text-center pb-20">
                    💡 Tip: Hold <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Shift</kbd> and click to select a range
                </div>
            )}

            {/* Confirmation Modal (Assign) */}
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

            {/* Confirmation Modal (Bulk set status) */}
            <ConfirmModal
                isOpen={showStatusConfirmModal}
                onClose={() => {
                    setShowStatusConfirmModal(false);
                    setPendingStatusUpdate(null);
                }}
                onConfirm={confirmBulkStatusUpdate}
                title="Confirm bulk status update"
                message={pendingStatusUpdate
                    ? `Set outreach status to "${pendingStatusUpdate.status}" for ${selectedCompanies.size} ${selectedCompanies.size === 1 ? 'company' : 'companies'}?`
                    : ''
                }
                confirmText="Set status"
                cancelText="Cancel"
                variant="warning"
                isLoading={isUpdatingStatus}
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
