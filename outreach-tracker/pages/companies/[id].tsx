import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { Transition } from '@headlessui/react';
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
    ArrowPathIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    ArrowUturnLeftIcon,
    CalendarDaysIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon, ClockIcon as ClockIconSolid } from '@heroicons/react/24/solid';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { useBackgroundTasks } from '../../contexts/BackgroundTasksContext';
import ConfirmModal from '../../components/ConfirmModal';
import InteractionSection from '../../components/InteractionSection';
import { disciplineToDisplay, disciplineToDatabase, disciplineOptions } from '../../lib/discipline-mapping';
import { priorityToDisplay, priorityToDatabase, priorityOptions } from '../../lib/priority-mapping';
import { formatTime } from '../../lib/schedule-calculator';

interface Contact {
    id: string;
    rowNumber?: number;
    name: string;
    phone?: string;
    email?: string;
    isEmailInvalid?: boolean;
    role?: string;
    linkedin?: string;
    remark?: string;
    isActive?: boolean;
    activeMethods?: string;
}

interface HistoryEntry {
    id: string;
    timestamp: string;
    user: string;
    action: string;
    remark?: string;
}

function parseIsoLikeTimestamp(value?: string): number | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
        return null;
    }
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

interface Company {
    id: string;
    companyName: string;
    name?: string;
    contactStatus: string;
    relationshipStatus: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    remark?: string;
    history?: any[];
    discipline?: string;
    targetSponsorshipTier?: string;
    followUpsCompleted?: number;
    lastCompanyActivity?: string;
    sponsorshipTier?: string;
    previousResponse?: string;
    lastContact?: string;
    lastResponse?: string;
    assignedPic?: string;
    daysAttending?: string;
    channel?: string;
}

const contactStatusOptions = ['To Contact', 'Contacted', 'To Follow Up', 'No Reply'];
const relationshipStatusOptions = ['Interested', 'Registered', 'Rejected'];
const sponsorshipTierOptions = ['Official Partner', 'Gold', 'Silver', 'Bronze'];
const REJECTION_REASON_TAG = '[Rejection Reason]';

function extractPlainRejectionReason(remark?: string): string {
    if (!remark) return '';
    const trimmed = remark.trim();
    if (!trimmed) return '';

    // Keep only the "reason" part; strip appended audit/history blocks.
    // Current save logic appends audit as: "[Company Update]: ..."
    const beforeAudit = trimmed.split('\n\n[Company Update]:')[0].trim();

    if (beforeAudit.startsWith(REJECTION_REASON_TAG)) {
        let rest = beforeAudit.slice(REJECTION_REASON_TAG.length).trim();
        if (rest.startsWith(':')) rest = rest.slice(1).trim();
        return rest;
    }

    // If the remark is only the appended audit/history block and no user-entered text exists,
    // do not treat it as a valid rejection reason.
    if (beforeAudit.startsWith('[Company Update]:')) return '';

    // Back-compat: if older rows exist without a tag, treat the first block as reason.
    return beforeAudit.trim();
}

function withRejectionReasonTag(reason: string): string {
    const trimmed = reason.trim();
    if (!trimmed) return '';
    return trimmed.startsWith(REJECTION_REASON_TAG) ? trimmed : `${REJECTION_REASON_TAG} ${trimmed}`;
}

const STORAGE_KEY_SELECTION_RESTORE = 'companies_selection_restore';
// disciplineOptions and priorityOptions are now imported from mapping utilities

export default function CompanyDetailPage() {
    const router = useRouter();
    const { id, from } = router.query;
    const { user } = useCurrentUser();
    const currentUser = user?.name ?? 'Committee Member';
    const canEdit = user?.canEditCompanies === true;

    const [company, setCompany] = useState<Company | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [activeTab, setActiveTab] = useState<'details' | 'contacts' | 'history'>('details');
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [contactStatus, setContactStatus] = useState('');
    const [relationshipStatus, setRelationshipStatus] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isFlagged, setIsFlagged] = useState(false);
    const [discipline, setDiscipline] = useState('');
    const [targetSponsorshipTier, setTargetSponsorshipTier] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [followUpsCompleted, setFollowUpsCompleted] = useState(0);
    const [lastCompanyActivity, setLastCompanyActivity] = useState('');
    const [lastCommitteeContact, setLastCommitteeContact] = useState('');
    const [sponsorshipTier, setSponsorshipTier] = useState('');
    const [companyResponseDate, setCompanyResponseDate] = useState('');
    const [daysAttending, setDaysAttending] = useState('');
    const [channel, setChannel] = useState('');
    const [scheduledDate, setScheduledDate] = useState<string>('');
    const [scheduledTime, setScheduledTime] = useState<string>('');
    const [scheduleEntries, setScheduleEntries] = useState<{ companyId: string; date: string; time: string; note?: string; completed?: string; order?: number; pic?: string; companyName?: string }[]>([]);
    const [outreachScheduleDate, setOutreachScheduleDate] = useState('');
    const [outreachScheduleTime, setOutreachScheduleTime] = useState('');
    const [outreachScheduleNote, setOutreachScheduleNote] = useState('');
    const [isFetchingScheduleSlot, setIsFetchingScheduleSlot] = useState(false);
    const [isSettingSchedule, setIsSettingSchedule] = useState(false);
    const [editingScheduleEntryIndex, setEditingScheduleEntryIndex] = useState<number | null>(null);
    const [editScheduleDate, setEditScheduleDate] = useState('');
    const [editScheduleTime, setEditScheduleTime] = useState('');
    const [editScheduleNote, setEditScheduleNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showAddContact, setShowAddContact] = useState(false);
    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false, isEmailInvalid: false });
    const [committeeMembers, setCommitteeMembers] = useState<{ name: string, email: string, role: string }[]>([]);

    // Custom Modal States
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorTitle, setErrorTitle] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const [copiedContactField, setCopiedContactField] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(true);
    const [showNavigationModal, setShowNavigationModal] = useState(false);
    const [pendingRoute, setPendingRoute] = useState<string | null>(null);
    const [retryConfig, setRetryConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        onCancel: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        onCancel: () => { }
    });
    const [showConfirmDeleteCompanyModal, setShowConfirmDeleteCompanyModal] = useState(false);
    const [isDeletingCompany, setIsDeletingCompany] = useState(false);
    const [showConfirmDeleteScheduleEntryModal, setShowConfirmDeleteScheduleEntryModal] = useState(false);
    const [scheduleEntryToDelete, setScheduleEntryToDelete] = useState<{ date: string; time: string; note?: string } | null>(null);

    const { addTask, completeTask, failTask, setWarningTask } = useBackgroundTasks();

    const showError = (title: string, message: string) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setShowErrorModal(true);
    };

    const companyId = typeof id === 'string' ? decodeURIComponent(id) : '';
    const fromSource = typeof from === 'string' ? from : Array.isArray(from) ? (from[0] ?? '') : '';

    const fetchData = async (forceRefresh = false) => {
        setLoading(true);
        const taskId = forceRefresh ? addTask(`Refreshing ${editedName || 'company'} data...`) : null;

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

            const data = await res.json();
            const companies: Company[] = data.companies || [];
            // Email schedule navigates with the real sheet id; do not fall back to companyName or
            // a duplicate name can match before the intended id and open the wrong company.
            const found =
                fromSource === 'email-schedule'
                    ? companies.find(c => c.id === companyId)
                    : companies.find(c => c.id === companyId || c.companyName === companyId);
            if (found) {
                setCompany(found);
                setEditedName(found.companyName || found.name || '');
                setContactStatus(found.contactStatus || 'To Contact');
                setRelationshipStatus(found.relationshipStatus || '');
                setIsFlagged(found.isFlagged);
                setDiscipline(disciplineToDisplay(found.discipline)); // Convert DB abbreviation to display name
                setTargetSponsorshipTier(priorityToDisplay(found.targetSponsorshipTier)); // Convert DB abbreviation to display name
                setAssignedTo(found.assignedPic || found.pic || 'Unassigned');
                setFollowUpsCompleted(found.followUpsCompleted || 0);
                setLastCompanyActivity(found.lastCompanyActivity || found.lastUpdated || '');
                setLastCommitteeContact(found.lastContact || '');
                setSponsorshipTier(found.sponsorshipTier || '');
                setDaysAttending(found.daysAttending || '');
                setChannel(found.channel || '');
            } else {
                setNotFound(true);
            }
            if (taskId) completeTask(taskId, 'Data refreshed');
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                if (taskId) failTask(taskId, 'Refresh timed out');
                console.error('Fetch timed out');
                showError("Timeout", "The request took too long. The Google Sheets API might be slow. Please try refreshing.");
            } else {
                if (taskId) failTask(taskId, 'Refresh failed');
                console.error('Failed to load company', err);
                setNotFound(true);
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
        if (companyId) fetchData();
        if (user) fetchCommitteeMembers();
    }, [companyId, fromSource, user]);

    // Fetch email schedule for this company (admin schedule section) — loads ALL entries
    const fetchScheduleForCompany = useCallback(async () => {
        if (!company?.id) return;
        try {
            const res = await fetch('/api/email-schedule');
            if (!res.ok) return;
            const json = await res.json();
            const allEntries = (json.entries || []) as { companyId: string; date: string; time: string; note?: string; completed?: string; order?: number; pic?: string; companyName?: string }[];
            const companyEntries = allEntries
                .filter(e => e.companyId === company.id)
                .sort((a, b) => a.date.localeCompare(b.date));
            setScheduleEntries(companyEntries);
            // Keep scheduledDate/Time pointing at most recent entry for backward-compat
            const last = companyEntries[companyEntries.length - 1];
            if (last) {
                setScheduledDate(last.date);
                setScheduledTime(last.time);
            } else {
                setScheduledDate('');
                setScheduledTime('');
            }
        } catch {
            setScheduleEntries([]);
            setScheduledDate('');
            setScheduledTime('');
        }
    }, [company?.id]);

    useEffect(() => {
        if (company?.id && user?.isAdmin) fetchScheduleForCompany();
    }, [company?.id, user?.isAdmin, fetchScheduleForCompany]);

    // When admin changes outreach date, fetch next available start time
    useEffect(() => {
        if (!outreachScheduleDate || !user?.isAdmin) return;
        setIsFetchingScheduleSlot(true);
        fetch(`/api/email-schedule/available-slots?date=${outreachScheduleDate}`)
            .then(res => res.ok ? res.json() : ({} as { nextStartTime?: string }))
            .then((json: { nextStartTime?: string }) => {
                if (json.nextStartTime) setOutreachScheduleTime(json.nextStartTime);
            })
            .finally(() => setIsFetchingScheduleSlot(false));
    }, [outreachScheduleDate, user?.isAdmin]);

    const handleSetOutreachSchedule = useCallback(async () => {
        if (!company || !user?.isAdmin || !outreachScheduleDate || !outreachScheduleTime) return;
        const pic = assignedTo?.trim();
        if (!pic || pic === 'Unassigned') {
            showError('Assign PIC first', 'Please assign this company to a committee member before setting the outreach schedule.');
            return;
        }

        // Only auto "To Follow Up" when scheduling a *new* date slot after at least one
        // completed outreach — not when editing the first slot's time, nor when adding a
        // second row before any outreach has been completed (e.g. rescheduling to another day).
        const scheduleDateKey = outreachScheduleDate.trim().slice(0, 10);
        const hasEntryForThisDate = scheduleEntries.some(
            e => e.date.trim().slice(0, 10) === scheduleDateKey,
        );
        const hasPriorCompletedOutreach =
            scheduleEntries.some(e => e.completed === 'Y') || (followUpsCompleted || 0) > 0;
        const isFollowUpScheduleSlot = hasPriorCompletedOutreach && !hasEntryForThisDate;
        // Auto-set contact status to To Follow Up when scheduling a follow-up after prior outreach
        const statusAllowsAutoFollowUp = ['To Contact', 'Contacted'].includes(contactStatus);

        setIsSettingSchedule(true);
        const taskId = addTask('Setting outreach schedule...');
        try {
            // saveEmailScheduleEntries uses companyId|date as key: same-date updates overwrite,
            // new dates (follow-ups) always add a new row — full scheduling history is preserved.
            await fetch('/api/email-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyIds: [company.id],
                    companyNames: { [company.id]: company.companyName || company.name || company.id },
                    pic,
                    date: outreachScheduleDate,
                    startTime: outreachScheduleTime,
                    note: outreachScheduleNote.trim() || undefined,
                }),
            });
            setScheduledDate(outreachScheduleDate);
            setScheduledTime(outreachScheduleTime);

            // Auto-set "To Follow Up" when assigning a new follow-up slot after prior outreach completed
            if (isFollowUpScheduleSlot && statusAllowsAutoFollowUp) {
                try {
                    await fetch('/api/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyId: company.id,
                            updates: { contactStatus: 'To Follow Up' },
                            user: currentUser,
                            remark: '[Auto] Contact status set to To Follow Up — follow-up outreach scheduled after prior outreach completed',
                        }),
                    });
                    setContactStatus('To Follow Up');
                } catch (statusErr) {
                    console.error('Failed to auto-set To Follow Up contact status', statusErr);
                }
            }

            // Append note to remarks if provided
            if (outreachScheduleNote.trim()) {
                try {
                    await fetch('/api/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyId: company.id,
                            updates: {},
                            user: currentUser,
                            remark: `[Follow-up Note] ${outreachScheduleNote.trim()}`,
                        }),
                    });
                } catch (noteErr) {
                    console.error('Failed to append schedule note to remarks', noteErr);
                }
            }

            setOutreachScheduleNote('');
            completeTask(taskId, 'Outreach schedule set');
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Set schedule failed', err);
            failTask(taskId, 'Failed to set schedule');
        } finally {
            setIsSettingSchedule(false);
        }
    }, [company, user?.isAdmin, outreachScheduleDate, outreachScheduleTime, outreachScheduleNote, assignedTo, scheduleEntries, followUpsCompleted, contactStatus, currentUser, addTask, completeTask, failTask, showError, fetchScheduleForCompany]);

    const handleClearOutreachSchedule = useCallback(async () => {
        if (!company || !user?.isAdmin) return;
        setIsSettingSchedule(true);
        const taskId = addTask('Clearing outreach schedule...');
        try {
            const schedRes = await fetch('/api/email-schedule');
            const schedJson = await schedRes.json();
            const entries = (schedJson.entries || []) as { companyId: string; date: string }[];
            const datesToClear = [...new Set(entries.filter((e: { companyId: string }) => e.companyId === company.id).map((e: { date: string }) => e.date))];
            for (const date of datesToClear) {
                await fetch('/api/email-schedule', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds: [company.id], date }),
                });
            }
            setScheduledDate('');
            setScheduledTime('');
            setScheduleEntries([]);
            setOutreachScheduleDate('');
            setOutreachScheduleTime('');
            setOutreachScheduleNote('');
            completeTask(taskId, 'Schedule cleared');
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Clear schedule failed', err);
            failTask(taskId, 'Failed to clear schedule');
        } finally {
            setIsSettingSchedule(false);
        }
    }, [company, user?.isAdmin, addTask, completeTask, failTask, fetchScheduleForCompany]);

    const handleDeleteScheduleEntry = useCallback(async (entry: { date: string; time: string; note?: string }) => {
        if (!company || !user?.isAdmin) return;
        setIsSettingSchedule(true);
        const taskId = addTask('Removing schedule entry...');
        try {
            await fetch('/api/email-schedule', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyIds: [company.id], date: entry.date }),
            });
            setEditingScheduleEntryIndex(null);
            completeTask(taskId, 'Schedule entry removed');
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Delete schedule entry failed', err);
            failTask(taskId, 'Failed to remove entry');
        } finally {
            setIsSettingSchedule(false);
        }
    }, [company, user?.isAdmin, addTask, completeTask, failTask, fetchScheduleForCompany]);

    const handleStartEditScheduleEntry = useCallback((entry: { date: string; time: string; note?: string }, index: number) => {
        setEditingScheduleEntryIndex(index);
        setEditScheduleDate(entry.date);
        setEditScheduleTime(entry.time);
        setEditScheduleNote(entry.note ?? '');
    }, []);

    const handleCancelEditScheduleEntry = useCallback(() => {
        setEditingScheduleEntryIndex(null);
        setEditScheduleDate('');
        setEditScheduleTime('');
        setEditScheduleNote('');
    }, []);

    const handleMarkScheduleEntryComplete = useCallback(async (entry: { companyId: string; date: string; time: string; note?: string; completed?: string; order?: number; pic?: string; companyName?: string }) => {
        if (!company || !user?.isAdmin || entry.completed === 'Y') return;
        setIsSettingSchedule(true);
        const taskId = addTask('Marking schedule as complete...');
        try {
            await fetch('/api/email-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entries: [{
                        companyId: company.id,
                        companyName: company.companyName || company.name || company.id,
                        pic: entry.pic || assignedTo || '',
                        date: entry.date,
                        time: entry.time,
                        order: entry.order ?? 0,
                        note: entry.note,
                        completed: 'Y',
                    }],
                }),
            });
            completeTask(taskId, 'Schedule marked complete');
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Mark complete failed', err);
            failTask(taskId, 'Failed to mark complete');
        } finally {
            setIsSettingSchedule(false);
        }
    }, [company, user?.isAdmin, assignedTo, addTask, completeTask, failTask, fetchScheduleForCompany]);

    const handleUnmarkScheduleEntryComplete = useCallback(async (entry: { companyId: string; date: string; time: string; note?: string; completed?: string; order?: number; pic?: string; companyName?: string }) => {
        if (!company || !user?.isAdmin || entry.completed !== 'Y') return;
        setIsSettingSchedule(true);
        const taskId = addTask('Cancelling completion...');
        try {
            await fetch('/api/email-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entries: [{
                        companyId: company.id,
                        companyName: company.companyName || company.name || company.id,
                        pic: entry.pic || assignedTo || '',
                        date: entry.date,
                        time: entry.time,
                        order: entry.order ?? 0,
                        note: entry.note,
                        completed: '',
                    }],
                }),
            });
            completeTask(taskId, 'Completion cancelled');
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Cancel completion failed', err);
            failTask(taskId, 'Failed to cancel completion');
        } finally {
            setIsSettingSchedule(false);
        }
    }, [company, user?.isAdmin, assignedTo, addTask, completeTask, failTask, fetchScheduleForCompany]);

    const handleSaveScheduleEntryEdit = useCallback(async () => {
        if (!company || !user?.isAdmin || editingScheduleEntryIndex === null) return;
        const entry = scheduleEntries[editingScheduleEntryIndex];
        if (!entry) return;
        const newDate = editScheduleDate.trim();
        const newTime = editScheduleTime.trim();
        const newNote = editScheduleNote.trim() || undefined;
        if (!newDate || !newTime) return;

        setIsSettingSchedule(true);
        const taskId = addTask('Updating schedule entry...');
        try {
            const pic = assignedTo?.trim() || '';
            if (newDate === entry.date) {
                await fetch('/api/email-schedule', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entries: [{
                            companyId: company.id,
                            companyName: company.companyName || company.name || company.id,
                            pic,
                            date: newDate,
                            time: newTime,
                            note: newNote,
                            completed: entry.completed,
                        }],
                    }),
                });
            } else {
                await fetch('/api/email-schedule', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds: [company.id], date: entry.date }),
                });
                await fetch('/api/email-schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyIds: [company.id],
                        companyNames: { [company.id]: company.companyName || company.name || company.id },
                        pic,
                        date: newDate,
                        startTime: newTime,
                        note: newNote,
                    }),
                });
            }
            setEditingScheduleEntryIndex(null);
            setEditScheduleDate('');
            setEditScheduleTime('');
            setEditScheduleNote('');
            completeTask(taskId, 'Schedule entry updated');
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Update schedule entry failed', err);
            failTask(taskId, 'Failed to update entry');
        } finally {
            setIsSettingSchedule(false);
        }
    }, [company, user?.isAdmin, scheduleEntries, editingScheduleEntryIndex, editScheduleDate, editScheduleTime, editScheduleNote, assignedTo, addTask, completeTask, failTask, fetchScheduleForCompany]);

    // Mark the most recent incomplete schedule entry as completed after outreach is logged
    const markScheduleEntryCompleted = useCallback(async () => {
        if (!company) return;
        const incompleteEntries = scheduleEntries
            .filter(e => e.completed !== 'Y')
            .sort((a, b) => b.date.localeCompare(a.date));
        const toMark = incompleteEntries[0];
        if (!toMark) return;
        try {
            await fetch('/api/email-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entries: [{
                        companyId: toMark.companyId,
                        companyName: company.companyName || company.name || toMark.companyId,
                        pic: assignedTo || '',
                        date: toMark.date,
                        time: toMark.time,
                        note: toMark.note,
                        completed: 'Y',
                    }],
                }),
            });
            fetchScheduleForCompany();
        } catch (err) {
            console.error('Failed to mark schedule entry as completed', err);
        }
    }, [company, scheduleEntries, assignedTo, fetchScheduleForCompany]);

    const handleAddNote = useCallback(async () => {
        if (!company || !remarks.trim()) return;
        setIsSavingNote(true);
        const taskId = addTask('Saving note...');
        try {
            const res = await fetch('/api/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: company.id,
                    updates: {},
                    user: currentUser,
                    remark: `[Note] ${remarks.trim()}`,
                }),
            });
            if (res.ok) {
                setRemarks('');
                completeTask(taskId, 'Note saved');
                fetchData(true);
            } else {
                throw new Error('Save failed');
            }
        } catch (err) {
            console.error('Failed to save note', err);
            failTask(taskId, 'Failed to save note');
        } finally {
            setIsSavingNote(false);
        }
    }, [company, remarks, currentUser, addTask, completeTask, failTask]);

    const handleConfirmNavigation = () => {
        setHasUnsavedChanges(false);
        setShowNavigationModal(false);
        if (pendingRoute) {
            router.push(pendingRoute);
        }
    };
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        const handleRouteChange = (url: string) => {
            if (hasUnsavedChanges) {
                setPendingRoute(url);
                setShowNavigationModal(true);
                router.events.emit('routeChangeError');
                throw 'routeChange aborted';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        router.events.on('routeChangeStart', handleRouteChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            router.events.off('routeChangeStart', handleRouteChange);
        };
    }, [hasUnsavedChanges, router]);

    useEffect(() => {
        const handleRouteChange = (url: string) => {
            const pathname = url.split('?')[0];
            if (pathname !== '/companies') {
                try {
                    sessionStorage.removeItem(STORAGE_KEY_SELECTION_RESTORE);
                } catch (_) {}
            }
        };
        router.events.on('routeChangeStart', handleRouteChange);
        return () => router.events.off('routeChangeStart', handleRouteChange);
    }, [router]);

    // Sync unsaved changes warning with background task indicator
    useEffect(() => {
        setWarningTask(
            'unsaved-changes',
            'You have unsaved changes. Click "Update Status" to save.',
            hasUnsavedChanges && showUnsavedWarning && !isSaving
        );
        return () => {
            setWarningTask('unsaved-changes', '', false);
        };
    }, [hasUnsavedChanges, showUnsavedWarning, isSaving, setWarningTask]);

    useEffect(() => {
        if (company) {
            setEditedName(company.companyName || company.name || '');
            setContactStatus(company.contactStatus || 'To Contact');
            setRelationshipStatus(company.relationshipStatus || '');
            setIsFlagged(company.isFlagged);
            setDiscipline(disciplineToDisplay(company.discipline)); // Convert DB abbreviation to display name
            setTargetSponsorshipTier(priorityToDisplay(company.targetSponsorshipTier)); // Convert DB abbreviation to display name
            setAssignedTo(company.pic || 'Unassigned');
            setFollowUpsCompleted(company.followUpsCompleted || 0);
            setLastCompanyActivity(company.lastCompanyActivity || company.lastUpdated || '');
            setLastCommitteeContact(company.lastContact || '');
            setSponsorshipTier(company.sponsorshipTier || '');
            setChannel(company.channel || '');
            setDaysAttending(company.daysAttending || '');
            setHasUnsavedChanges(false);
        }
    }, [company]);

    const contacts: Contact[] = (company?.contacts || []).map((c: any) => ({
        ...c,
        name: c.name ?? c.picName ?? ''
    }));
    const history: HistoryEntry[] = company?.history || [];

    const staleThresholdDays = 3;
    const isCompanyStalled = lastCompanyActivity ? (Date.now() - new Date(lastCompanyActivity).getTime()) / (1000 * 60 * 60 * 24) > 7 : false;
    // Follow-up due: only show when status is Contacted and it's been at least 3 days since last committee contact (lastContact = when we last contacted them)
    const lastCommitteeContactValue = company?.lastContact || '';
    const lastCommitteeContactAtMs = parseIsoLikeTimestamp(lastCommitteeContactValue);
    const isFollowUpDue = company?.contactStatus === 'Contacted'
        && lastCommitteeContactAtMs !== null
        && (Date.now() - lastCommitteeContactAtMs) / (1000 * 60 * 60 * 24) >= 3;

    // Warning Logic: Company Replied > Committee Contact > 3 Days
    const needsReplyWarning = (() => {
        if (!company?.previousResponse || !company.lastContact) return false;

        const lastCommitteeContactTime = parseIsoLikeTimestamp(company.lastContact);
        const lastCompanyReplyDate = parseIsoLikeTimestamp(company.previousResponse);
        if (lastCommitteeContactTime === null || lastCompanyReplyDate === null) return false;

        const daysSinceReply = (Date.now() - lastCompanyReplyDate) / (1000 * 60 * 60 * 24);

        // Return true if company replied AFTER we last contacted them AND it's been > 3 days
        return (lastCompanyReplyDate > lastCommitteeContactTime) && (daysSinceReply > 3);
    })();

    const nextPendingEmailSchedule = (() => {
        const now = Date.now();
        const pending = scheduleEntries
            .filter(e => e.completed !== 'Y')
            .map(e => {
                const dt = new Date(`${e.date}T${e.time}`);
                return { ...e, ts: dt.getTime() };
            })
            .filter(e => Number.isFinite(e.ts))
            .sort((a, b) => a.ts - b.ts);
        const next = pending[0] || null;
        if (!next) return null;
        return { ...next, isOverdue: next.ts < now };
    })();
    const daysSinceCommitteeContact = lastCommitteeContactAtMs === null
        ? null
        : (Date.now() - lastCommitteeContactAtMs) / (1000 * 60 * 60 * 24);
    const isCommitteeStale = contactStatus === 'To Contact'
        ? !!nextPendingEmailSchedule?.isOverdue
        : (lastCommitteeContactAtMs === null || (daysSinceCommitteeContact !== null && daysSinceCommitteeContact > staleThresholdDays));

    // Success messages now shown via background tasks only

    const handleLogOutreach = async () => {
        if (!company) return;

        // Use the current local contactStatus state to determine if it's the first contact
        const isFirstOutreach = contactStatus === 'To Contact';
        const newCount = isFirstOutreach ? 0 : (followUpsCompleted || 0) + 1;

        // Use selected date or default to now
        const timestamp = companyResponseDate ? new Date(companyResponseDate).toISOString() : new Date().toISOString();

        const actionTag = isFirstOutreach ? 'Outreach' : 'Follow-up';
        const remarkPrefix = `[${actionTag} #${newCount}]`;

        // Stage changes locally
        if (contactStatus === 'To Contact') {
            setContactStatus('Contacted');
        }
        setFollowUpsCompleted(newCount);
        setLastCompanyActivity(timestamp);
        setLastCommitteeContact(timestamp);

        // Append prefix to remarks if not already there
        setRemarks(prev => {
            const trimmed = prev.trim();
            if (trimmed.startsWith(remarkPrefix)) return trimmed;
            return trimmed ? `${remarkPrefix} ${trimmed}` : `${remarkPrefix} Logged`;
        });

        setHasUnsavedChanges(true);
        setShowUnsavedWarning(true);
    };

    const handleLogCompanyReply = async () => {
        if (!company) return;

        const timestamp = new Date().toISOString();
        const replyDateISO = companyResponseDate ? new Date(companyResponseDate).toISOString() : timestamp;
        const remarkPrefix = `[Company Reply]`;

        // Stage changes locally — company replied positively: move to To Follow Up contact-wise,
        // and mark Interested unless already Registered (avoid regressing a closed deal).
        if (relationshipStatus !== 'Registered') setRelationshipStatus('Interested');
        setContactStatus('To Follow Up');
        setCompanyResponseDate(replyDateISO);

        setRemarks(prev => {
            const trimmed = prev.trim();
            if (trimmed.startsWith(remarkPrefix)) return trimmed;
            return trimmed ? `${remarkPrefix} ${trimmed}` : `${remarkPrefix} Received`;
        });

        setHasUnsavedChanges(true);
        setShowUnsavedWarning(true);
    };

    const handleLogOurReply = async () => {
        if (!company) return;

        const timestamp = companyResponseDate ? new Date(companyResponseDate).toISOString() : new Date().toISOString();
        const remarkPrefix = `[Our Reply]`;

        // Stage changes locally
        setLastCompanyActivity(timestamp);
        setLastCommitteeContact(timestamp);

        setRemarks(prev => {
            const trimmed = prev.trim();
            if (trimmed.startsWith(remarkPrefix)) return trimmed;
            return trimmed ? `${remarkPrefix} ${trimmed}` : `${remarkPrefix} Sent`;
        });

        setHasUnsavedChanges(true);
        setShowUnsavedWarning(true);
    };

    const handleResetFollowUps = async () => {
        if (!company) return;

        const previousCompanyState = { ...company };
        const remarkText = `[User Update]: Follow-up counter reset`;

        const performSave = async () => {
            setCompany({ ...company, followUpsCompleted: 0 });
            setFollowUpsCompleted(0);

            const taskId = addTask(`Resetting follow-up counter...`);

            try {
                const res = await fetch('/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyId: company.id,
                        updates: { followUpsCompleted: 0 },
                        user: currentUser,
                        remark: remarkText
                    })
                });
                if (res.ok) {
                    const result = await res.json();
                    if (result.verifiedData) {
                        setCompany(prev => prev ? {
                            ...prev,
                            followUpsCompleted: result.verifiedData.followUpsCompleted,
                            lastUpdated: result.verifiedData.lastUpdated,
                            remark: result.verifiedData.remark
                        } : null);
                        setFollowUpsCompleted(result.verifiedData.followUpsCompleted);
                    }
                    // No need to fetch immediately
                    fetchData(true);
                    completeTask(taskId, 'Counter reset');
                } else {
                    throw new Error('Update failed');
                }
            } catch (error) {
                console.error('Reset failed', error);
                failTask(taskId, 'Failed to reset');

                setRetryConfig({
                    isOpen: true,
                    title: 'Reset Failed',
                    message: "We couldn't reset the follow-up counter. Try again?",
                    onConfirm: () => performSave(),
                    onCancel: () => {
                        setCompany(previousCompanyState);
                        setFollowUpsCompleted(previousCompanyState.followUpsCompleted || 0);
                    }
                });
            }
        };

        performSave();
    };

    const handleDisciplineChangeLocal = (value: string) => {
        const currentList = discipline ? discipline.split(',').map(s => s.trim()).filter(Boolean) : [];
        let newList: string[];

        if (currentList.includes(value)) {
            newList = currentList.filter(item => item !== value);
        } else {
            newList = [...currentList, value].sort();
        }

        setDiscipline(newList.join(', '));
        setHasUnsavedChanges(true);
        setShowUnsavedWarning(true);
    };

    const handlePriorityChangeLocal = (value: string) => {
        setTargetSponsorshipTier(value);
        setHasUnsavedChanges(true);
        setShowUnsavedWarning(true);
    };

    const handleAssignedToChangeLocal = (value: string) => {
        setAssignedTo(value);
        setHasUnsavedChanges(true);
        setShowUnsavedWarning(true);
    };

    const handleSave = async () => {
        if (!company) return;

        const existingRejectionReason = extractPlainRejectionReason(company.remark);
        const effectiveRejectionReason = remarks.trim() || existingRejectionReason;

        // Validate rejection reason
        if (relationshipStatus === 'Rejected' && !effectiveRejectionReason.trim()) {
            showError("Reason Required", "Please provide a rejection reason before saving.");
            return;
        }

        // Validate sponsorship tier for registration
        if (relationshipStatus === 'Registered' && !sponsorshipTier) {
            showError("Sponsorship Tier Required", "Please select a sponsorship tier before marking as Registered.");
            return;
        }

        // Prepare data for save
        // If discipline is changed to array, handle it here. Assuming `discipline` is currently string, but user wants multi-select.
        // I will first implement the diff logic assuming string for now, but handle comma-split for comparison if needed.

        const previousCompanyState = { ...company };

        // Generate Audit Log for History
        const changes: string[] = [];

        // Helper to format values
        const fmt = (val: any) => val ? val : '(none)';

        if (company.contactStatus !== contactStatus) changes.push(`Contact Status: ${fmt(company.contactStatus)} → ${contactStatus}`);
        if (company.relationshipStatus !== relationshipStatus) changes.push(`Relationship Status: ${fmt(company.relationshipStatus || '—')} → ${relationshipStatus || '—'}`);

        // Handle Discipline Diff (String vs String but potentially multi-value)
        // If I haven't implemented multi-select UI yet, this just diffs strings.
        // If I will change discipline to array, I need to know.
        // For this step I assume `discipline` state is still string, but I'll update it later.
        if (disciplineToDisplay(company.discipline) !== discipline) {
            changes.push(`Discipline: ${fmt(disciplineToDisplay(company.discipline))} → ${discipline}`);
        }

        if (priorityToDisplay(company.targetSponsorshipTier) !== targetSponsorshipTier) {
            changes.push(`Target Tier: ${fmt(priorityToDisplay(company.targetSponsorshipTier))} → ${targetSponsorshipTier}`);
        }

        if ((company.pic || 'Unassigned') !== assignedTo) {
            changes.push(`Assigned To: ${fmt(company.pic || 'Unassigned')} → ${assignedTo}`);
        }

        if ((company.followUpsCompleted || 0) !== followUpsCompleted) {
            changes.push(`Follow-ups: ${company.followUpsCompleted || 0} → ${followUpsCompleted}`);
        }

        if ((company.daysAttending || '') !== daysAttending) {
            changes.push(`Days Attending: ${company.daysAttending || '(none)'} → ${daysAttending}`);
        }

        if ((company.channel || '') !== channel) {
            changes.push(`Channel: ${company.channel || '(none)'} → ${channel}`);
        }

        if (relationshipStatus === 'Interested' || relationshipStatus === 'Registered') {
            if ((company.sponsorshipTier || '') !== sponsorshipTier) {
                changes.push(`Sponsorship Tier: ${fmt(company.sponsorshipTier)} → ${sponsorshipTier}`);
            }
        }

        // If there are changes, append them to remark or use them as remark
        let finalRemark = remarks.trim();
        if (relationshipStatus === 'Rejected') {
            // Ensure future rejected saves are tagged, and do not overwrite an existing reason
            // when the textarea is empty (e.g. after a prior save).
            finalRemark = withRejectionReasonTag(effectiveRejectionReason);
        }
        if (changes.length > 0) {
            const auditLog = `[Company Update]: ${changes.join(', ')}`;
            finalRemark = finalRemark ? `${finalRemark}\n\n${auditLog}` : auditLog;
        } else if (!finalRemark) {
            // No changes and no remark? Maybe just saving name?
            if (company.companyName !== editedName) {
                finalRemark = `[Company Update]: Name changed: ${company.companyName} → ${editedName}`;
            }
        }

        // Optimistic Update
        const newCompanyState = {
            ...company,
            contactStatus,
            relationshipStatus,
            isFlagged,
            remark: finalRemark || company.remark, // Use the new remark with history
            companyName: editedName,
            discipline: disciplineToDatabase(discipline), // Convert display name back to DB code
            targetSponsorshipTier: priorityToDatabase(targetSponsorshipTier),
            pic: assignedTo,
            followUpsCompleted,
            // Keep committee contact separate from company activity to avoid overwriting
            // Last Committee Contact Date with Previous Response timestamps on save.
            lastContact: lastCommitteeContact,
            daysAttending,
            channel,
            ...(relationshipStatus === 'Interested' || relationshipStatus === 'Registered' ? { sponsorshipTier } : {}),
            ...(companyResponseDate ? { lastCompanyActivity: new Date(companyResponseDate).toISOString() } : {})
        };

        // If we are in edit mode, exit it immediately
        setIsEditMode(false);
        setRemarks(''); // Clear remarks input

        // Manually update the 'company' state without waiting for re-fetch
        setCompany(newCompanyState);

        const taskId = addTask(`Saving changes for ${editedName || company.name}...`);

        try {
            const res = await fetch('/api/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: company.id,
                    updates: {
                        contactStatus: newCompanyState.contactStatus,
                        ...(newCompanyState.relationshipStatus !== (company.relationshipStatus || '') ? { relationshipStatus: newCompanyState.relationshipStatus } : {}),
                        isFlagged: newCompanyState.isFlagged,
                        companyName: newCompanyState.companyName,
                        discipline: newCompanyState.discipline, // Send DB code
                        targetSponsorshipTier: newCompanyState.targetSponsorshipTier, // Send DB code
                        assignedPic: newCompanyState.pic,
                        followUpsCompleted: newCompanyState.followUpsCompleted,
                        lastContact: newCompanyState.lastContact,
                        daysAttending: newCompanyState.daysAttending,
                        channel: newCompanyState.channel,
                        ...(relationshipStatus === 'Interested' || relationshipStatus === 'Registered' ? { sponsorshipTier } : {})
                    },
                    user: currentUser,
                    remark: finalRemark
                })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.verifiedData) {
                    setCompany(prev => prev ? {
                        ...prev,
                        contactStatus: result.verifiedData.contactStatus,
                        relationshipStatus: result.verifiedData.relationshipStatus,
                        followUpsCompleted: result.verifiedData.followUpsCompleted,
                        lastContact: result.verifiedData.lastContact,
                        lastUpdated: result.verifiedData.lastUpdated,
                        remark: result.verifiedData.remark
                    } : null);
                    setContactStatus(result.verifiedData.contactStatus || 'To Contact');
                    setRelationshipStatus(result.verifiedData.relationshipStatus || '');
                    setFollowUpsCompleted(result.verifiedData.followUpsCompleted);
                    setLastCommitteeContact(result.verifiedData.lastContact || '');
                }
                // Background fetch to ensure consistency
                fetchData(true);
                setHasUnsavedChanges(false);
                completeTask(taskId, 'Changes saved successfully');
                // If this save included an outreach or follow-up log, mark the nearest schedule entry completed
                const isOutreachLog = finalRemark.startsWith('[Outreach') || finalRemark.startsWith('[Follow-up');
                if (isOutreachLog) {
                    markScheduleEntryCompleted();
                }
            } else {
                throw new Error('Update failed');
            }
        } catch (error) {
            console.error('Failed to update company', error);
            failTask(taskId, 'Failed to save changes');
            showError("Save Failed", "Could not save changes to the server. Reverting...");

            // Revert optimistic update
            setCompany(previousCompanyState);
            // Also reset local form state if needed, though they match 'company' which is now reverted
        } finally {
            // setIsSaving(false); // remove if we rely on optimistic
        }
    };

    const handleUpdateContact = async (rowNumber: number, updates: any) => {
        if (!company) return;

        // Optimistic Update
        const previousCompanyState = { ...company };

        // Update local state immediately
        const updatedContacts = (company.contacts || []).map((c: any) => {
            if (c.rowNumber === rowNumber) {
                return {
                    ...c,
                    name: updates.picName ?? c.name,
                    picName: updates.picName ?? c.picName,
                    role: updates.role ?? c.role,
                    email: updates.email ?? c.email,
                    isEmailInvalid: updates.isEmailInvalid ?? c.isEmailInvalid,
                    phone: updates.phone ?? c.phone,
                    linkedin: updates.linkedin ?? c.linkedin,
                    remark: updates.remark ?? c.remark,
                    isActive: updates.isActive ?? c.isActive
                };
            }
            return c;
        });

        setCompany({
            ...company,
            contacts: updatedContacts
        });

        const taskId = addTask(`Updating contact ${updates.picName || 'information'}...`);

        try {
            const res = await fetch('/api/update-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rowNumber,
                    updates,
                    companyId: company.id,
                    user: currentUser,
                    historyLog: (() => {
                        const originalContact = previousCompanyState.contacts.find((c: any) => c.rowNumber === rowNumber);
                        if (!originalContact) return `Updated contact`;

                        const changes: string[] = [];
                        const fmt = (val: any) => val ? val : '(none)';
                        const norm = (val: any) => (val || '').trim();

                        // Use originalContact.name instead of picName, and normalize comparison
                        if (updates.picName !== undefined && norm(updates.picName) !== norm(originalContact.name))
                            changes.push(`Name: ${fmt(originalContact.name)} → ${updates.picName}`);

                        if (updates.role !== undefined && norm(updates.role) !== norm(originalContact.role))
                            changes.push(`Role: ${fmt(originalContact.role)} → ${updates.role}`);

                        // email, phone, linkedin, remark, isActive match property names
                        if (updates.email !== undefined && norm(updates.email) !== norm(originalContact.email))
                            changes.push(`Email: ${fmt(originalContact.email)} → ${updates.email}`);

                        if (updates.phone !== undefined && norm(updates.phone) !== norm(originalContact.phone))
                            changes.push(`Phone: ${fmt(originalContact.phone)} → ${updates.phone}`);

                        if (updates.linkedin !== undefined && norm(updates.linkedin) !== norm(originalContact.linkedin))
                            changes.push(`LinkedIn: ${fmt(originalContact.linkedin)} → ${updates.linkedin}`);

                        if (updates.remark !== undefined && norm(updates.remark) !== norm(originalContact.remark))
                            changes.push(`Remark: ${fmt(originalContact.remark)} → ${updates.remark}`);

                        if (updates.isActive !== undefined && updates.isActive !== originalContact.isActive)
                            changes.push(`Active: ${originalContact.isActive} → ${updates.isActive}`);

                        return changes.length > 0
                            ? `[Contact Update]: ${originalContact.name} - ${changes.join(', ')}`
                            : undefined; // Return undefined to skip logging if no real changes
                    })()
                })
            });

            if (res.ok) {
                // Background fetch to ensure consistency
                fetchData(true);
                completeTask(taskId, 'Contact updated successfully');
            } else {
                throw new Error('Update failed');
            }
        } catch (error) {
            console.error('Error updating contact:', error);
            failTask(taskId, 'Failed to update contact');
            showError("Update Failed", "Could not save contact changes to the server. Reverting...");
            // Revert optimistic update
            setCompany(previousCompanyState);
        }
    };

    const handleContactAction = async (contact?: Contact) => {
        if (editingContactId && contact && contact.rowNumber) {
            // No setIsSaving(true) to avoid blocking UI during optimistic update
            try {
                await handleUpdateContact(contact.rowNumber, {
                    picName: newContact.name,
                    role: newContact.role,
                    email: newContact.email,
                    phone: newContact.phone,
                    linkedin: newContact.linkedin,
                    remark: newContact.remark,
                    isActive: newContact.isActive,
                    isEmailInvalid: newContact.isEmailInvalid,
                });
                setEditingContactId(null);
                setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false, isEmailInvalid: false });
                setShowAddContact(false);
            } catch (error) {
                // Errors handled in handleUpdateContact
            }
        } else if (newContact.name) {
            const taskId = addTask(`Adding new contact ${newContact.name}...`);
            try {
                const res = await fetch('/api/add-contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyId: company?.id,
                        companyName: company?.companyName || company?.name,
                        discipline: company?.discipline || '',
                        contact: newContact,
                        user: currentUser,
                        historyLog: `[Contact Added]: ${newContact.name} (${newContact.role || 'No role'})`
                    })
                });

                if (res.ok) {
                    fetchData(true);
                    completeTask(taskId, 'Contact added successfully');
                    setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false, isEmailInvalid: false });
                    setShowAddContact(false);
                } else {
                    throw new Error('Failed to add contact');
                }
            } catch (error) {
                console.error('Error adding contact:', error);
                failTask(taskId, 'Failed to add contact');
                showError("Add Contact Failed", "Could not add the new contact.");
            }
        }
    };

    const handleCopyContactField = (text: string, fieldId: string) => {
        if (!text?.trim()) return;
        navigator.clipboard.writeText(text.trim()).then(() => {
            setCopiedContactField(fieldId);
            setTimeout(() => setCopiedContactField(null), 1500);
        });
    };

    const startEditingContact = (contact: Contact) => {
        setEditingContactId(contact.id);
        setNewContact({
            name: contact.name,
            phone: contact.phone || '',
            email: contact.email || '',
            role: contact.role || '',
            linkedin: contact.linkedin || '',
            remark: contact.remark || '',
            isActive: contact.isActive || false,
            isEmailInvalid: contact.isEmailInvalid || false,
        });
        setShowAddContact(true);
    };

    const handleDeleteContact = (contact: Contact) => {
        setContactToDelete(contact);
        setShowConfirmDeleteModal(true);
    };

    const confirmDeleteContact = async () => {
        if (!contactToDelete || !company) return;
        const contact = contactToDelete;

        if (!contact.rowNumber) {
            showError("Error", "Cannot delete contact: row number not found");
            return;
        }

        // Optimistic Update
        const previousCompanyState = { ...company };

        // Update local state immediately
        const updatedContacts = (company.contacts || []).filter((c: any) => c.rowNumber !== contact.rowNumber);
        setCompany({
            ...company,
            contacts: updatedContacts
        });

        // UI Feedback
        setShowConfirmDeleteModal(false);
        setContactToDelete(null);

        const taskId = addTask(`Deleting contact ${contact.name}...`);

        try {
            const res = await fetch('/api/delete-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rowNumber: contact.rowNumber,
                    companyId: company.id,
                    user: currentUser,
                    historyLog: `Deleted contact: ${contact.name} (${contact.role || 'No Role'})`
                })
            });

            if (res.ok) {
                // Background fetch to ensure consistency
                fetchData(true);
                completeTask(taskId, `Contact ${contact.name} deleted successfully`);
            } else {
                throw new Error('Deletion failed');
            }
        } catch (error) {
            console.error('Error deleting contact:', error);
            failTask(taskId, 'Failed to delete contact');
            showError("Delete Failed", "Could not delete contact from the server. Reverting...");
            // Revert optimistic update
            setCompany(previousCompanyState);
        }
    };

    const confirmDeleteCompany = async () => {
        if (!company?.id || !user?.isAdmin) return;
        setIsDeletingCompany(true);
        const taskId = addTask('Deleting company...');
        try {
            const res = await fetch('/api/delete-company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId: company.id, user: currentUser }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Delete failed');
            }
            completeTask(taskId, 'Company archived');
            setShowConfirmDeleteCompanyModal(false);
            router.push('/companies?refresh=1');
        } catch (err) {
            console.error('Delete company error:', err);
            failTask(taskId, err instanceof Error ? err.message : 'Delete failed');
            showError('Delete Failed', err instanceof Error ? err.message : 'Could not delete the company. Please try again.');
        } finally {
            setIsDeletingCompany(false);
        }
    };

    const handleClearAllContactMethods = async (targetContact: Contact) => {
        if (!company || !targetContact.rowNumber) return;

        const previousCompanyState = { ...company };

        // Optimistic update
        const updatedContacts = (company.contacts || []).map((c: any) => {
            if (c.rowNumber === targetContact.rowNumber) {
                return {
                    ...c,
                    activeMethods: '',
                    isActive: false
                };
            }
            return c;
        });

        setCompany({ ...company, contacts: updatedContacts });

        const taskId = addTask(`Removing ${targetContact.name} from Currently Contacting...`);

        try {
            const res = await fetch('/api/set-primary-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: company.id,
                    rowNumber: targetContact.rowNumber,
                    method: 'all',  // Using 'all' to signal clear-all
                    isMethodActive: false,
                    user: currentUser
                })
            });

            if (res.ok) {
                if (!hasUnsavedChanges) fetchData(true);
                completeTask(taskId, `${targetContact.name} removed from Currently Contacting`);
            } else {
                throw new Error('Failed to clear contact methods');
            }
        } catch (error) {
            console.error('Error clearing contact methods:', error);
            failTask(taskId, 'Failed to update contact');
            showError('Update Failed', 'Could not update the contact. Reverting...');
            setCompany(previousCompanyState);
        }
    };

    const handleToggleContactMethod = async (targetContact: Contact, method: string, isMethodActive: boolean) => {
        if (!company || !targetContact.rowNumber) return;
        if (method === 'email' && isMethodActive && targetContact.isEmailInvalid) {
            showError('Invalid email', 'This contact’s email is marked invalid. Unmark it as invalid (or update the email) before setting email as an active method.');
            return;
        }

        const previousCompanyState = { ...company };

        // Optimistic update
        const updatedContacts = (company.contacts || []).map((c: any) => {
            if (c.rowNumber === targetContact.rowNumber) {
                const currentMethods = c.activeMethods ? c.activeMethods.split(',') : [];
                let newMethods = [...currentMethods];

                if (isMethodActive) {
                    if (!newMethods.includes(method)) newMethods.push(method);
                } else {
                    newMethods = newMethods.filter((m: string) => m !== method);
                }

                return {
                    ...c,
                    activeMethods: newMethods.join(','),
                    isActive: newMethods.length > 0
                };
            }
            return c;
        });

        setCompany({ ...company, contacts: updatedContacts });

        const methodLabel = method.charAt(0).toUpperCase() + method.slice(1);
        const label = isMethodActive ? `Marking ${methodLabel} as active for ${targetContact.name}...` : `Removing ${methodLabel} for ${targetContact.name}...`;
        const taskId = addTask(label);

        try {
            const res = await fetch('/api/set-primary-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: company.id,
                    rowNumber: targetContact.rowNumber,
                    method,
                    isMethodActive,
                    user: currentUser
                })
            });

            if (res.ok) {
                if (!hasUnsavedChanges) fetchData(true);
                completeTask(taskId, isMethodActive ? `${methodLabel} marked active for ${targetContact.name}` : `${methodLabel} removed`);
            } else {
                throw new Error('Failed to update contact method');
            }
        } catch (error) {
            console.error('Error toggling contact method:', error);
            failTask(taskId, 'Failed to update contact');
            showError('Update Failed', 'Could not update the contact. Reverting...');
            setCompany(previousCompanyState);
        }
    };


    const handleRevert = () => {
        if (company) {
            setEditedName(company.companyName || company.name || '');
            setContactStatus(company.contactStatus || 'To Contact');
            setRelationshipStatus(company.relationshipStatus || '');
            setIsFlagged(company.isFlagged);
            setDiscipline(disciplineToDisplay(company.discipline));
            setTargetSponsorshipTier(priorityToDisplay(company.targetSponsorshipTier));
            setAssignedTo(company.pic || 'Unassigned');
            setFollowUpsCompleted(company.followUpsCompleted || 0);
            setLastCompanyActivity(company.lastCompanyActivity || company.lastUpdated || '');
            setLastCommitteeContact(company.lastContact || '');
            setSponsorshipTier(company.sponsorshipTier || '');
            setChannel(company.channel || '');
            setDaysAttending(company.daysAttending || '');
            setRemarks('');
            setIsEditMode(false);
            setHasUnsavedChanges(false);
        }
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
            'To Follow Up': 'bg-amber-100 text-amber-700',
            'No Reply': 'bg-gray-100 text-gray-500',
        };
        return colors[s] || 'bg-slate-100 text-slate-700';
    };

    const getRelationshipColor = (s: string) => {
        const colors: Record<string, string> = {
            'Interested': 'bg-purple-100 text-purple-700',
            'Registered': 'bg-green-100 text-green-700',
            'Rejected': 'bg-red-100 text-red-700',
        };
        return colors[s] || 'bg-slate-100 text-slate-700';
    };

    if (loading && !company) {
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
                        href={fromSource === 'committee' ? '/committee' : fromSource === 'email-schedule' ? '/email-schedule' : '/companies'}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                        {fromSource === 'committee' ? 'Back to Workspace' : fromSource === 'email-schedule' ? 'Back to Email Schedule' : 'Back to All Companies'}
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
        <Layout title={`${company.id} ${company.companyName || company.name} | Outreach Tracker`}>
            <div className="max-w-4xl mx-auto">
                {/* Back link */}
                <Link
                    href={fromSource === 'committee' ? '/committee' : fromSource === 'email-schedule' ? '/email-schedule' : '/companies'}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    {fromSource === 'committee' ? 'Back to Workspace' : fromSource === 'email-schedule' ? 'Back to Email Schedule' : 'Back to All Companies'}
                </Link>

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3">
                                {relationshipStatus === 'Registered' && <CheckCircleIcon className="w-7 h-7 text-green-400 flex-shrink-0 mt-0.5" aria-label="Registered" />}
                                {relationshipStatus === 'Rejected' && <XCircleIcon className="w-7 h-7 text-red-400 flex-shrink-0 mt-0.5" aria-label="Rejected" />}
                                {relationshipStatus === 'Interested' && <ClockIconSolid className="w-7 h-7 text-amber-400 flex-shrink-0 mt-0.5" aria-label="Interested" />}
                                {canEdit && isEditMode ? (
                                    <div className="min-w-0">
                                        <input
                                            type="text"
                                            value={editedName}
                                            onChange={(e) => {
                                                setEditedName(e.target.value);
                                                setHasUnsavedChanges(true);
                                                setShowUnsavedWarning(true);
                                            }}
                                            className="text-2xl font-bold bg-white/20 text-white border-b border-white/40 focus:outline-none focus:border-white px-2 py-1 rounded w-full"
                                        />
                                        <div className="text-sm text-blue-200/90 mt-0.5 font-mono">{company.id}</div>
                                    </div>
                                ) : (
                                    <div className="min-w-0">
                                        <h1 className="text-2xl font-bold text-white truncate">
                                            {company.companyName || company.name}
                                        </h1>
                                        <div className="text-sm text-blue-200/90 mt-0.5 font-mono">
                                            {company.id}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(company.contactStatus)}`}>
                                    {company.contactStatus || 'To Contact'}
                                </span>
                                {company.relationshipStatus && (
                                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getRelationshipColor(company.relationshipStatus)}`}>
                                        {company.relationshipStatus}
                                    </span>
                                )}
                                {(company.contactStatus === 'Contacted' || (followUpsCompleted || 0) > 0) && (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/30 text-blue-100 text-xs font-medium">
                                            <ArrowPathIcon className="w-3 h-3" />
                                            {followUpsCompleted || 0}/3 Follow-ups
                                        </span>
                                        {canEdit && (
                                            <button
                                                type="button"
                                                onClick={handleResetFollowUps}
                                                disabled={isSaving}
                                                className="p-1 rounded-full text-blue-200 hover:text-white hover:bg-white/20 transition-colors"
                                                title="Reset Follow Up Counter"
                                                aria-label="Reset Follow Up Counter"
                                            >
                                                <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-start justify-start gap-2 lg:max-w-[50%] lg:justify-end">
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className="p-1 rounded hover:bg-white/20 transition-colors"
                                    title={isEditMode ? 'View Mode' : 'Edit Company Details'}
                                >
                                    <PencilSquareIcon className="w-5 h-5 text-blue-200 hover:text-white" />
                                </button>
                            )}
                            {isFlagged && <FlagIcon className="w-6 h-6 text-red-400 flex-shrink-0" aria-label="Flagged" />}
                            {isCommitteeStale && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                                    <ClockIcon className="w-3 h-3" />
                                    STALE
                                </span>
                            )}
                            {isFollowUpDue && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                                    <ClockIcon className="w-3 h-3" />
                                    FOLLOW-UP DUE
                                </span>
                            )}
                            {needsReplyWarning && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold border border-red-200 animate-pulse">
                                    <ExclamationTriangleIcon className="w-3 h-3" />
                                    REPLY OVERDUE
                                </span>
                            )}
                            {nextPendingEmailSchedule && (
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${nextPendingEmailSchedule.isOverdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                    <ClockIcon className="w-3 h-3" />
                                    {new Date(nextPendingEmailSchedule.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {formatTime(nextPendingEmailSchedule.time)}
                                </span>
                            )}
                            {(() => {
                                const hasIncompleteFollowUp = scheduleEntries.some(e => e.completed !== 'Y');
                                const isLaterStage = ['Interested', 'Registered'].includes(relationshipStatus);
                                return hasIncompleteFollowUp && isLaterStage ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                                        <CalendarDaysIcon className="w-3 h-3" />
                                        Follow-up scheduled
                                    </span>
                                ) : null;
                            })()}
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
                    {/* Success notifications now shown via background tasks */}

                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="contactStatus" className="block text-sm font-medium text-slate-700 mb-2">Contact Status</label>
                                    <select
                                        id="contactStatus"
                                        value={contactStatus}
                                        onChange={(e) => {
                                            setContactStatus(e.target.value);
                                            setHasUnsavedChanges(true);
                                            setShowUnsavedWarning(true);
                                        }}
                                        disabled={!canEdit}
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                                    >
                                        {contactStatusOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="relationshipStatus" className="block text-sm font-medium text-slate-700 mb-2">Relationship Status</label>
                                    <select
                                        id="relationshipStatus"
                                        value={relationshipStatus}
                                        onChange={(e) => {
                                            setRelationshipStatus(e.target.value);
                                            setHasUnsavedChanges(true);
                                            setShowUnsavedWarning(true);
                                        }}
                                        disabled={!canEdit}
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                                    >
                                        <option value="">— None —</option>
                                        {relationshipStatusOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Channel */}
                            <div>
                                <label htmlFor="channel" className="block text-sm font-medium text-slate-700 mb-2 font-semibold">Outreach Channel</label>
                                <select
                                    id="channel"
                                    value={channel}
                                    onChange={(e) => {
                                        setChannel(e.target.value);
                                        setHasUnsavedChanges(true);
                                        setShowUnsavedWarning(true);
                                    }}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900"
                                >
                                    <option value="">-- Select Channel --</option>
                                    <option value="Email">Email</option>
                                    <option value="LinkedIn">LinkedIn</option>
                                    <option value="Phone">Phone</option>
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="In-person">In-person</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            {/* Sponsorship Tier - Show when relationship status is Interested or Registered */}
                            {(relationshipStatus === 'Interested' || relationshipStatus === 'Registered') && (
                                <div>
                                    <label htmlFor="sponsorshipTier" className="block text-sm font-medium text-slate-700 mb-2 font-semibold">Sponsorship Tier</label>
                                    <select
                                        id="sponsorshipTier"
                                        value={sponsorshipTier}
                                        onChange={(e) => {
                                            setSponsorshipTier(e.target.value);
                                            setHasUnsavedChanges(true);
                                            setShowUnsavedWarning(true);
                                        }}
                                        disabled={!canEdit}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900"
                                    >
                                        <option value="">Select Tier</option>
                                        {sponsorshipTierOptions.map(tier => (
                                            <option key={tier} value={tier}>{tier}</option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {relationshipStatus === 'Registered'
                                            ? 'Please select the sponsorship tier the company has committed to.'
                                            : 'Please select the sponsorship tier the company is interested in.'}
                                    </p>
                                </div>
                            )}

                            {/* Days Attending */}
                            {(relationshipStatus === 'Interested' || relationshipStatus === 'Registered') && (
                                <div>
                                    <label htmlFor="daysAttending" className="block text-sm font-medium text-slate-700 mb-2 font-semibold">Days Attending</label>
                                    <input
                                        type="text"
                                        id="daysAttending"
                                        value={daysAttending}
                                        onChange={(e) => {
                                            setDaysAttending(e.target.value);
                                            setHasUnsavedChanges(true);
                                            setShowUnsavedWarning(true);
                                        }}
                                        disabled={!canEdit}
                                        placeholder="e.g. 1, 2, 4"
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900"
                                    />
                                    <p className="mt-1 text-xs text-slate-500">Enter comma-separated day numbers</p>
                                </div>
                            )}


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
                                    onChange={(e) => {
                                        setRemarks(e.target.value);
                                        setHasUnsavedChanges(true);
                                        setShowUnsavedWarning(true);
                                    }}
                                    disabled={!canEdit}
                                    placeholder={relationshipStatus === 'Rejected' ? 'Please provide rejection reason...' : 'Add context about this update...'}
                                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 resize-none disabled:bg-slate-50 disabled:cursor-not-allowed ${
                                        relationshipStatus === 'Rejected' && (() => {
                                            const savedReason = extractPlainRejectionReason(company?.remark);
                                            const effectiveReason = remarks.trim() || savedReason;
                                            return !effectiveReason.trim();
                                        })()
                                            ? 'border-red-300 focus:ring-red-500'
                                            : 'border-slate-300 focus:ring-blue-500'
                                    }`}
                                />
                                {canEdit && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleAddNote}
                                            disabled={!remarks.trim() || isSavingNote}
                                            className="px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Save this text as a [Note] remark (no interaction log)"
                                        >
                                            {isSavingNote ? 'Saving note…' : 'Add note only'}
                                        </button>
                                        <span className="text-[11px] text-slate-500">
                                            Saves as <span className="font-mono">[Note]</span> without changing status or follow-up count.
                                        </span>
                                    </div>
                                )}
                                {(() => {
                                    const savedReason = extractPlainRejectionReason(company?.remark);
                                    const effectiveReason = remarks.trim() || savedReason;
                                    const isMissing = relationshipStatus === 'Rejected' && !effectiveReason.trim();
                                    return isMissing ? (
                                    <p className="mt-1 text-xs text-red-600">A rejection reason is required when marking as Rejected.</p>
                                    ) : null;
                                })()}
                            </div>

                            {/* Quick Actions Replaced by InteractionSection */}
                            <InteractionSection
                                contactStatus={contactStatus}
                                relationshipStatus={relationshipStatus}
                                onLogOutreach={handleLogOutreach}
                                onLogCompanyReply={handleLogCompanyReply}
                                onLogOurReply={handleLogOurReply}
                                onResetFollowUps={handleResetFollowUps}
                                isSaving={isSaving}
                                disabled={!canEdit}
                                hasRemarks={(() => {
                                    const r = remarks.trim();
                                    if (!r) return false;
                                    // Ignore system-generated prefixes when checking for substantive remarks
                                    const systemPrefixes = ['[Outreach', '[Follow-up', '[Company Reply]', '[Our Reply]', '[System'];
                                    const hasPrefix = systemPrefixes.some(p => r.startsWith(p));
                                    if (!hasPrefix) return true;

                                    // If it has a prefix, check if there is content after the closing bracket
                                    const bracketIndex = r.indexOf(']');
                                    if (bracketIndex === -1) return true;
                                    const substantiveContent = r.substring(bracketIndex + 1).trim();
                                    return substantiveContent.length > 0 && substantiveContent !== 'Logged' && substantiveContent !== 'Received' && substantiveContent !== 'Sent';
                                })()}
                                followUpCount={followUpsCompleted}
                                selectedDate={companyResponseDate}
                                onDateChange={setCompanyResponseDate}
                                lastContactDate={company.lastContact}
                                lastCompanyResponseDate={company.previousResponse}
                            />
                            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <input
                                    type="checkbox"
                                    id="flagged"
                                    checked={isFlagged}
                                    onChange={(e) => {
                                        setIsFlagged(e.target.checked);
                                        setHasUnsavedChanges(true);
                                        setShowUnsavedWarning(true);
                                    }}
                                    disabled={!canEdit}
                                    className="mt-1 w-4 h-4 text-red-600 border-red-300 rounded focus:ring-red-500 disabled:cursor-not-allowed"
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
                                    <div className="space-y-2 max-h-48 overflow-y-auto p-2 border border-slate-300 rounded-lg">
                                        {disciplineOptions.map((opt) => {
                                            const isSelected = discipline.split(',').map(s => s.trim()).includes(opt);
                                            return (
                                                <label key={opt} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleDisciplineChangeLocal(opt)}
                                                        disabled={!canEdit}
                                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
                                                    />
                                                    <span className={`text-sm ${isSelected ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                                                        {opt}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Target Sponsorship Tier</label>
                                    <select
                                        value={targetSponsorshipTier}
                                        onChange={(e) => {
                                            setTargetSponsorshipTier(e.target.value);
                                            setHasUnsavedChanges(true);
                                            setShowUnsavedWarning(true);
                                        }}
                                        disabled={!canEdit}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400 transition-colors disabled:bg-slate-50 disabled:cursor-not-allowed"
                                    >
                                        <option value="">Select tier...</option>
                                        {priorityOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Assigned To</label>
                                    <select
                                        value={assignedTo}
                                        onChange={(e) => handleAssignedToChangeLocal(e.target.value)}
                                        disabled={!canEdit}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400 transition-colors disabled:bg-slate-50 disabled:cursor-not-allowed"
                                    >
                                        <option value="Unassigned">Unassigned</option>
                                        {committeeMembers.length > 0 ? (
                                            committeeMembers.map((member) => (
                                                <option key={member.email} value={member.name}>{member.name}</option>
                                            ))
                                        ) : (
                                            <option value={assignedTo}>{assignedTo}</option>
                                        )}
                                    </select>
                                </div>
                            </div>

                            {/* Outreach schedule - Admin only */}
                            {user?.isAdmin && (
                                <div className="pt-4 border-t border-slate-200">
                                    <div className="flex items-center gap-2 mb-3">
                                        <CalendarDaysIcon className="w-5 h-5 text-indigo-600" aria-hidden />
                                        <label className="block text-sm font-medium text-slate-700">Outreach schedule</label>
                                    </div>

                                    {/* All existing schedule entries */}
                                    {scheduleEntries.length > 0 && (
                                        <div className="mb-3 space-y-1.5">
                                            {scheduleEntries.map((entry, idx) => {
                                                const scheduledMs = entry?.date && entry?.time ? new Date(`${entry.date}T${entry.time}`).getTime() : NaN;
                                                const isPast = Number.isFinite(scheduledMs) && scheduledMs <= Date.now();
                                                const isCompleted = entry.completed === 'Y';
                                                const canEdit = !isPast && !isCompleted;
                                                const rowKey = `schedule-${entry.date ?? ''}-${entry.time ?? ''}-${idx}`;
                                                return (
                                                <div key={rowKey} className="flex items-center gap-2 text-sm flex-wrap">
                                                    {editingScheduleEntryIndex === idx ? (
                                                        <div className="flex flex-wrap items-end gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 w-full">
                                                            <div className="flex flex-col gap-0.5">
                                                                <label className="text-xs text-slate-500">Date</label>
                                                                <input
                                                                    type="date"
                                                                    value={editScheduleDate}
                                                                    min={new Date().toISOString().slice(0, 10)}
                                                                    onChange={e => setEditScheduleDate(e.target.value)}
                                                                    className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <label className="text-xs text-slate-500">Time</label>
                                                                <input
                                                                    type="time"
                                                                    value={editScheduleTime}
                                                                    onChange={e => setEditScheduleTime(e.target.value)}
                                                                    className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                                                                <label className="text-xs text-slate-500">Note</label>
                                                                <input
                                                                    type="text"
                                                                    value={editScheduleNote}
                                                                    onChange={e => setEditScheduleNote(e.target.value)}
                                                                    placeholder="Optional"
                                                                    className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleSaveScheduleEntryEdit}
                                                                    disabled={isSettingSchedule || !editScheduleDate.trim() || !editScheduleTime.trim()}
                                                                    className="px-2 py-1 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCancelEditScheduleEntry}
                                                                    disabled={isSettingSchedule}
                                                                    className="px-2 py-1 text-slate-600 hover:text-slate-800 text-xs font-medium rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${entry.completed === 'Y' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                                <CalendarDaysIcon className="w-3 h-3" />
                                                                {entry.date ?? '—'} at {entry.time ? formatTime(entry.time) : '—'}
                                                                <span className="ml-1">{entry.completed === 'Y' ? '✓ Completed' : '· Pending'}</span>
                                                            </span>
                                                            {entry.note && (
                                                                <span className="text-xs text-slate-500 italic">— {entry.note}</span>
                                                            )}
                                                            <span className="inline-flex items-center gap-1 ml-auto shrink-0">
                                                                {!isCompleted ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleMarkScheduleEntryComplete(entry)}
                                                                        disabled={isSettingSchedule}
                                                                        className="p-1 text-slate-500 hover:text-green-600 rounded hover:bg-green-50 disabled:opacity-50"
                                                                        title="Mark email as sent"
                                                                    >
                                                                        <CheckCircleIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleUnmarkScheduleEntryComplete(entry)}
                                                                        disabled={isSettingSchedule}
                                                                        className="p-1 text-slate-500 hover:text-amber-600 rounded hover:bg-amber-50 disabled:opacity-50"
                                                                        title="Cancel completion"
                                                                    >
                                                                        <XCircleIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartEditScheduleEntry(entry, idx)}
                                                                    disabled={isSettingSchedule || !canEdit}
                                                                    className="p-1 text-slate-500 hover:text-indigo-600 rounded hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    title={canEdit ? 'Edit' : isCompleted ? 'Completed entries cannot be edited' : 'Past schedule cannot be edited'}
                                                                >
                                                                    <PencilSquareIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setScheduleEntryToDelete(entry); setShowConfirmDeleteScheduleEntryModal(true); }}
                                                                    disabled={isSettingSchedule}
                                                                    className="p-1 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                                                                    title="Delete"
                                                                >
                                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                onClick={handleClearOutreachSchedule}
                                                disabled={isSettingSchedule}
                                                className="mt-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                                            >
                                                Clear all schedules
                                            </button>
                                        </div>
                                    )}

                                    {/* New schedule form */}
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col gap-0.5">
                                            <label className="text-xs text-slate-500">Date</label>
                                            <input
                                                type="date"
                                                value={outreachScheduleDate}
                                                min={new Date().toISOString().slice(0, 10)}
                                                onChange={e => setOutreachScheduleDate(e.target.value)}
                                                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        {outreachScheduleDate && (
                                            <div className="flex flex-col gap-0.5">
                                                <label className="text-xs text-slate-500 flex items-center gap-1">
                                                    Time
                                                    {isFetchingScheduleSlot && <span className="text-slate-400 text-[10px]">(loading…)</span>}
                                                </label>
                                                <input
                                                    type="time"
                                                    value={outreachScheduleTime}
                                                    onChange={e => setOutreachScheduleTime(e.target.value)}
                                                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>
                                        )}
                                        <div className="flex items-end gap-2">
                                            <button
                                                type="button"
                                                onClick={handleSetOutreachSchedule}
                                                disabled={isSettingSchedule || !outreachScheduleDate || !outreachScheduleTime || !assignedTo?.trim() || assignedTo === 'Unassigned'}
                                                className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSettingSchedule ? 'Setting…' : 'Set schedule'}
                                            </button>
                                        </div>
                                    </div>
                                    {outreachScheduleDate && (
                                        <div className="mt-2">
                                            <label className="text-xs text-slate-500">Note (optional)</label>
                                            <input
                                                type="text"
                                                value={outreachScheduleNote}
                                                onChange={e => setOutreachScheduleNote(e.target.value)}
                                                placeholder="e.g. Payment reminder, event update…"
                                                className="mt-0.5 w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    )}
                                    {(!assignedTo?.trim() || assignedTo === 'Unassigned') && (
                                        <p className="mt-2 text-xs text-slate-500">Assign the company to a committee member above before setting the schedule.</p>
                                    )}
                                </div>
                            )}

                            {/* Danger zone: Archive company — admin only */}
                            {user?.isAdmin && (
                                <div className="pt-6 mt-6 border-t border-red-200">
                                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                        <h4 className="text-sm font-semibold text-red-800 mb-1">Danger zone</h4>
                                        <p className="text-xs text-red-700 mb-3">Archive this company to remove it from the active list. You can restore it later from Settings → Archived Companies.</p>
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmDeleteCompanyModal(true)}
                                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                            Archive company
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'contacts' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-600">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddContact(!showAddContact);
                                            setEditingContactId(null);
                                            setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false, isEmailInvalid: false });
                                        }}
                                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                                    >
                                        <PlusIcon className="w-4 h-4" /> Add Contact
                                    </button>
                                )}
                            </div>
                            {canEdit && (showAddContact || editingContactId) && (
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
                                        <label className="col-start-2 -mt-1 flex items-center justify-end gap-2 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={!!newContact.isEmailInvalid}
                                                onChange={(e) => setNewContact({ ...newContact, isEmailInvalid: e.target.checked })}
                                                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                            />
                                            Mark email as invalid
                                        </label>
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
                                {contacts.filter(c => c.id !== editingContactId).map((contact) => (
                                    <div
                                        key={contact.id}
                                        className={`p-4 border rounded-lg transition-colors group ${contact.isActive
                                            ? 'bg-blue-50 border-blue-200'
                                            : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyContactField(contact.name, `${contact.id}-name`)}
                                                        title="Click to copy"
                                                        className="font-semibold text-slate-900 text-left hover:bg-slate-100 rounded px-0.5 -mx-0.5 py-0.5 transition-colors cursor-pointer"
                                                    >
                                                        {contact.name}
                                                    </button>
                                                    {copiedContactField === `${contact.id}-name` && <span className="text-xs text-green-600 font-medium">Copied!</span>}
                                                    {contact.role && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyContactField(contact.role!, `${contact.id}-role`)}
                                                                title="Click to copy"
                                                                className="text-xs text-slate-500 py-0.5 px-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                                                            >
                                                                {contact.role}
                                                            </button>
                                                            {copiedContactField === `${contact.id}-role` && <span className="text-xs text-green-600 font-medium">Copied!</span>}
                                                        </>
                                                    )}
                                                    {contact.isActive && (
                                                        <span className="inline-flex items-center gap-1 text-xs text-blue-700 py-0.5 pl-2 pr-1 bg-blue-100 rounded-full font-medium">
                                                            Currently Contacting
                                                            {canEdit && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearAllContactMethods(contact)}
                                                                    className="ml-0.5 p-0.5 hover:bg-blue-200 rounded-full transition-colors"
                                                                    title="Remove from currently contacting"
                                                                >
                                                                    <XMarkIcon className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                                                    {contact.phone && (
                                                        <div className="flex items-center gap-1.5 group/method">
                                                            <div className={`text-sm flex items-center gap-1 ${contact.activeMethods?.includes('phone') ? 'text-amber-700 font-medium' : 'text-slate-600'}`}>
                                                                <PhoneIcon className="w-4 h-4 shrink-0" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyContactField(contact.phone!, `${contact.id}-phone`)}
                                                                    title="Click to copy"
                                                                    className="hover:bg-slate-100 rounded px-0.5 -mx-0.5 py-0.5 transition-colors cursor-pointer text-left"
                                                                >
                                                                    {contact.phone}
                                                                </button>
                                                                {copiedContactField === `${contact.id}-phone` && <span className="text-xs text-green-600 font-medium">Copied!</span>}
                                                            </div>
                                                            {canEdit && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleContactMethod(contact, 'phone', !contact.activeMethods?.includes('phone'))}
                                                                    className={`p-1 rounded flex items-center justify-center transition-all ${contact.activeMethods?.includes('phone')
                                                                        ? 'text-amber-600 bg-amber-100 hover:bg-amber-200 opacity-100'
                                                                        : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover/method:opacity-100'
                                                                        }`}
                                                                    title={contact.activeMethods?.includes('phone') ? "Remove phone from active" : "Mark phone as active method"}
                                                                >
                                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    {contact.email && (
                                                        <div className="flex items-center gap-1.5 group/method">
                                                            <div className={`text-sm flex items-center gap-1 ${contact.activeMethods?.includes('email') ? 'text-amber-700 font-medium' : 'text-slate-600'} ${contact.isEmailInvalid ? 'line-through opacity-75' : ''}`}>
                                                                <EnvelopeIcon className="w-4 h-4 shrink-0" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyContactField(contact.email!, `${contact.id}-email`)}
                                                                    title="Click to copy"
                                                                    className="hover:bg-slate-100 rounded px-0.5 -mx-0.5 py-0.5 transition-colors cursor-pointer text-left"
                                                                >
                                                                    {contact.email}
                                                                </button>
                                                                {copiedContactField === `${contact.id}-email` && <span className="text-xs text-green-600 font-medium">Copied!</span>}
                                                                {contact.isEmailInvalid && (
                                                                    <span className="ml-1 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                                                        Invalid
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {canEdit && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleContactMethod(contact, 'email', !contact.activeMethods?.includes('email'))}
                                                                    disabled={!!contact.isEmailInvalid}
                                                                    className={`p-1 rounded flex items-center justify-center transition-all ${contact.activeMethods?.includes('email')
                                                                        ? 'text-amber-600 bg-amber-100 hover:bg-amber-200 opacity-100'
                                                                        : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover/method:opacity-100'
                                                                        }`}
                                                                    title={contact.isEmailInvalid ? "Email is marked invalid" : (contact.activeMethods?.includes('email') ? "Remove email from active" : "Mark email as active method")}
                                                                >
                                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {contact.remark && (
                                                    <p className="text-xs text-slate-500 mt-2 italic">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyContactField(contact.remark!, `${contact.id}-remark`)}
                                                            title="Click to copy"
                                                            className="text-left hover:bg-slate-100 rounded px-0.5 -mx-0.5 py-0.5 transition-colors cursor-pointer"
                                                        >
                                                            "{contact.remark}"
                                                        </button>
                                                        {copiedContactField === `${contact.id}-remark` && <span className="text-xs text-green-600 font-medium ml-1">Copied!</span>}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-1">
                                                {canEdit && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditingContact(contact)}
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100"
                                                            title="Edit Contact"
                                                        >
                                                            <PencilSquareIcon className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteContact(contact)}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100"
                                                            title="Delete Contact"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
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
                        {canEdit ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleRevert}
                                    className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => (hasUnsavedChanges || isEditMode) ? handleSave() : fetchData(true)}
                                    disabled={isSaving}
                                    className={`inline-flex items-center gap-2 px-6 py-2 text-sm font-medium rounded-lg transition-all ${isEditMode ? 'bg-indigo-600 hover:bg-indigo-700' :
                                        hasUnsavedChanges ? 'bg-green-600 hover:bg-green-700 shadow-lg scale-105' : 'bg-blue-600 hover:bg-blue-700'
                                        } text-white disabled:opacity-50`}
                                >
                                    {isSaving ? (
                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                    ) : (hasUnsavedChanges || isEditMode) ? (
                                        <CheckCircleIcon className="w-4 h-4" />
                                    ) : (
                                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                    )}
                                    {isEditMode ? 'Save All Changes' : hasUnsavedChanges ? 'Commit All Changes' : 'Refresh Data'}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fetchData(true)}
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh Data
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Error Alert Modal */}
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

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showConfirmDeleteModal}
                onClose={() => {
                    setShowConfirmDeleteModal(false);
                    setContactToDelete(null);
                }}
                onConfirm={confirmDeleteContact}
                title="Delete Contact"
                message={`Are you sure you want to delete ${contactToDelete?.name}? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                isLoading={isSaving}
            />

            {/* Delete schedule entry confirmation */}
            <ConfirmModal
                isOpen={showConfirmDeleteScheduleEntryModal}
                onClose={() => {
                    setShowConfirmDeleteScheduleEntryModal(false);
                    setScheduleEntryToDelete(null);
                }}
                onConfirm={() => {
                    if (scheduleEntryToDelete) {
                        handleDeleteScheduleEntry(scheduleEntryToDelete);
                        setShowConfirmDeleteScheduleEntryModal(false);
                        setScheduleEntryToDelete(null);
                    }
                }}
                title="Remove schedule entry"
                message={scheduleEntryToDelete ? `Remove ${scheduleEntryToDelete.date} at ${formatTime(scheduleEntryToDelete.time)} from the outreach schedule?` : ''}
                confirmText="Remove"
                cancelText="Cancel"
                variant="danger"
                isLoading={isSettingSchedule}
            />

            {/* Archive Company Confirmation Modal */}
            <ConfirmModal
                isOpen={showConfirmDeleteCompanyModal}
                onClose={() => !isDeletingCompany && setShowConfirmDeleteCompanyModal(false)}
                onConfirm={confirmDeleteCompany}
                title="Archive company"
                message={`Archive ${company?.companyName || company?.name || company?.id}? The company will be removed from the active list but can be restored later from Settings → Archived Companies.`}
                confirmText="Archive"
                cancelText="Cancel"
                variant="danger"
                isLoading={isDeletingCompany}
            />

            {/* Navigation Confirmation Modal */}
            <ConfirmModal
                isOpen={showNavigationModal}
                onClose={() => {
                    setShowNavigationModal(false);
                    setPendingRoute(null);
                }}
                onConfirm={handleConfirmNavigation}
                title="Unsaved Changes"
                message="You have unsaved changes. Are you sure you want to leave this page? Your changes will be lost."
                confirmText="Leave Page"
                cancelText="Stay"
                variant="danger"
            />

            {/* Retry Confirmation Modal */}
            <ConfirmModal
                isOpen={retryConfig.isOpen}
                onClose={() => {
                    setRetryConfig(prev => ({ ...prev, isOpen: false }));
                    retryConfig.onCancel();
                }}
                onConfirm={() => {
                    setRetryConfig(prev => ({ ...prev, isOpen: false }));
                    retryConfig.onConfirm();
                }}
                title={retryConfig.title}
                message={retryConfig.message}
                confirmText="Try Again"
                cancelText="Revert Changes"
                variant="warning"
            />

            {/* Remaining Modals */}
        </Layout>
    );
}
