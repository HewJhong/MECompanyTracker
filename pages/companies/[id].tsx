import { useState, useEffect } from 'react';
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
    ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon, ClockIcon as ClockIconSolid } from '@heroicons/react/24/solid';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { useBackgroundTasks } from '../../contexts/BackgroundTasksContext';
import ConfirmModal from '../../components/ConfirmModal';
import InteractionSection from '../../components/InteractionSection';
import { disciplineToDisplay, disciplineToDatabase, disciplineOptions } from '../../lib/discipline-mapping';
import { priorityToDisplay, priorityToDatabase, priorityOptions } from '../../lib/priority-mapping';

interface Contact {
    id: string;
    rowNumber?: number;
    name: string;
    phone?: string;
    email?: string;
    role?: string;
    linkedin?: string;
    remark?: string;
    isActive?: boolean;
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

const statusOptions = ['To Contact', 'Contacted', 'Interested', 'Registered', 'Rejected', 'No Reply'];
const sponsorshipTierOptions = ['Official Partner', 'Gold', 'Silver', 'Bronze'];
// disciplineOptions and priorityOptions are now imported from mapping utilities

export default function CompanyDetailPage() {
    const router = useRouter();
    const { id } = router.query;
    const { user } = useCurrentUser();
    const currentUser = user?.name ?? 'Committee Member';
    const canEdit = user?.isCommitteeMember === true;

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
    const [targetSponsorshipTier, setTargetSponsorshipTier] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [followUpsCompleted, setFollowUpsCompleted] = useState(0);
    const [lastCompanyActivity, setLastCompanyActivity] = useState('');
    const [sponsorshipTier, setSponsorshipTier] = useState('');
    const [companyResponseDate, setCompanyResponseDate] = useState('');
    const [daysAttending, setDaysAttending] = useState('');
    const [channel, setChannel] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showAddContact, setShowAddContact] = useState(false);
    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false });
    const [committeeMembers, setCommitteeMembers] = useState<{ name: string, email: string, role: string }[]>([]);

    // Custom Modal States
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorTitle, setErrorTitle] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
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

    const { addTask, completeTask, failTask, setWarningTask } = useBackgroundTasks();

    const showError = (title: string, message: string) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setShowErrorModal(true);
    };

    const companyId = typeof id === 'string' ? decodeURIComponent(id) : '';

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
            const found = companies.find(c => c.id === companyId || c.companyName === companyId);
            if (found) {
                setCompany(found);
                setEditedName(found.companyName || found.name || '');
                setStatus(found.status);
                setIsFlagged(found.isFlagged);
                setDiscipline(disciplineToDisplay(found.discipline)); // Convert DB abbreviation to display name
                setTargetSponsorshipTier(priorityToDisplay(found.targetSponsorshipTier)); // Convert DB abbreviation to display name
                setAssignedTo(found.assignedPic || found.pic || 'Unassigned');
                setFollowUpsCompleted(found.followUpsCompleted || 0);
                setLastCompanyActivity(found.lastCompanyActivity || found.lastUpdated || '');
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
    }, [companyId, user]);

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
            setStatus(company.status);
            setIsFlagged(company.isFlagged);
            setDiscipline(disciplineToDisplay(company.discipline)); // Convert DB abbreviation to display name
            setTargetSponsorshipTier(priorityToDisplay(company.targetSponsorshipTier)); // Convert DB abbreviation to display name
            setAssignedTo(company.pic || 'Unassigned');
            setFollowUpsCompleted(company.followUpsCompleted || 0);
            setLastCompanyActivity(company.lastCompanyActivity || company.lastUpdated || '');
            setSponsorshipTier(company.sponsorshipTier || '');
            setHasUnsavedChanges(false);
        }
    }, [company]);

    const contacts: Contact[] = (company?.contacts || []).map((c: any) => ({
        ...c,
        name: c.name ?? c.picName ?? ''
    }));
    const history: HistoryEntry[] = company?.history || [];

    const isCommitteeStalled = company?.lastUpdated ? (Date.now() - new Date(company.lastUpdated).getTime()) / (1000 * 60 * 60 * 24) > 7 : false;
    const isCompanyStalled = lastCompanyActivity ? (Date.now() - new Date(lastCompanyActivity).getTime()) / (1000 * 60 * 60 * 24) > 7 : false;

    // Warning Logic: Company Replied > Committee Contact > 3 Days
    const needsReplyWarning = (() => {
        if (!company?.previousResponse) return false;

        const lastCommitteeContactDate = company.lastCompanyActivity ? new Date(company.lastCompanyActivity).getTime() : 0;
        const lastCompanyReplyDate = new Date(company.previousResponse).getTime();

        const daysSinceReply = (Date.now() - lastCompanyReplyDate) / (1000 * 60 * 60 * 24);

        // Return true if company replied AFTER we last contacted them AND it's been > 3 days
        return (lastCompanyReplyDate > lastCommitteeContactDate) && (daysSinceReply > 3);
    })();

    // Success messages now shown via background tasks only

    const handleLogOutreach = async () => {
        if (!company) return;

        // Use the current local status state to determine if it's the first contact
        const isFirstOutreach = status === 'To Contact';
        const newCount = isFirstOutreach ? 0 : (followUpsCompleted || 0) + 1;

        // Use selected date or default to now
        const timestamp = companyResponseDate ? new Date(companyResponseDate).toISOString() : new Date().toISOString();

        const actionTag = isFirstOutreach ? 'Outreach' : 'Follow-up';
        const remarkPrefix = `[${actionTag} #${newCount}]`;

        // Stage changes locally
        if (status === 'To Contact') {
            setStatus('Contacted');
        }
        setFollowUpsCompleted(newCount);
        setLastCompanyActivity(timestamp);

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

        // Stage changes locally
        setStatus('Interested');
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
        const remarkText = `[System] Follow-up counter reset by user`;

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

        // Validate rejection reason
        if (status === 'Rejected' && !remarks.trim()) {
            showError("Reason Required", "Please provide a rejection reason before saving.");
            return;
        }

        // Validate sponsorship tier for registration
        if (status === 'Registered' && !sponsorshipTier) {
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

        if (company.status !== status) changes.push(`Status: ${fmt(company.status)} → ${status}`);

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

        if (status === 'Interested' || status === 'Registered') {
            if ((company.sponsorshipTier || '') !== sponsorshipTier) {
                changes.push(`Sponsorship Tier: ${fmt(company.sponsorshipTier)} → ${sponsorshipTier}`);
            }
        }

        // If there are changes, append them to remark or use them as remark
        let finalRemark = remarks.trim();
        if (changes.length > 0) {
            const auditLog = `[System Update]: ${changes.join(', ')}`;
            finalRemark = finalRemark ? `${finalRemark}\n\n${auditLog}` : auditLog;
        } else if (!finalRemark) {
            // No changes and no remark? Maybe just saving name?
            if (company.companyName !== editedName) {
                finalRemark = `[System Update]: Name changed: ${company.companyName} → ${editedName}`;
            }
        }

        // Optimistic Update
        const newCompanyState = {
            ...company,
            status,
            isFlagged,
            remark: finalRemark || company.remark, // Use the new remark with history
            companyName: editedName,
            discipline: disciplineToDatabase(discipline), // Convert display name back to DB code
            targetSponsorshipTier: priorityToDatabase(targetSponsorshipTier),
            pic: assignedTo,
            followUpsCompleted,
            lastContact: lastCompanyActivity,
            daysAttending,
            channel,
            ...(status === 'Interested' || status === 'Registered' ? { sponsorshipTier } : {}),
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
                        status: newCompanyState.status,
                        isFlagged: newCompanyState.isFlagged,
                        companyName: newCompanyState.companyName,
                        discipline: newCompanyState.discipline, // Send DB code
                        targetSponsorshipTier: newCompanyState.targetSponsorshipTier, // Send DB code
                        assignedPic: newCompanyState.pic,
                        followUpsCompleted: newCompanyState.followUpsCompleted,
                        lastContact: newCompanyState.lastContact,
                        daysAttending: newCompanyState.daysAttending,
                        channel: newCompanyState.channel,
                        ...(status === 'Interested' || status === 'Registered' ? { sponsorshipTier } : {}),
                        ...(status === 'Replied' && companyResponseDate ? { previousResponse: new Date(companyResponseDate).toISOString() } : {})
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
                        status: result.verifiedData.status,
                        followUpsCompleted: result.verifiedData.followUpsCompleted,
                        lastContact: result.verifiedData.lastContact,
                        lastUpdated: result.verifiedData.lastUpdated,
                        remark: result.verifiedData.remark
                    } : null);
                    setStatus(result.verifiedData.status);
                    setFollowUpsCompleted(result.verifiedData.followUpsCompleted);
                }
                // Background fetch to ensure consistency
                fetchData(true);
                setHasUnsavedChanges(false);
                completeTask(taskId, 'Changes saved successfully');
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
                            ? `Updated contact ${originalContact.name}: ${changes.join(', ')}`
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
                    isActive: newContact.isActive
                });
                setEditingContactId(null);
                setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false });
                setShowAddContact(false);
            } catch (error) {
                // Errors handled in handleUpdateContact
            }
        } else if (newContact.name) {
            console.log('Add contact:', newContact);
            setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false });
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
            remark: contact.remark || '',
            isActive: contact.isActive || false
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

    const handleRevert = () => {
        if (company) {
            setEditedName(company.companyName || company.name || '');
            setStatus(company.status);
            setIsFlagged(company.isFlagged);
            setDiscipline(disciplineToDisplay(company.discipline));
            setTargetSponsorshipTier(priorityToDisplay(company.targetSponsorshipTier));
            setAssignedTo(company.pic || 'Unassigned');
            setFollowUpsCompleted(company.followUpsCompleted || 0);
            setLastCompanyActivity(company.lastCompanyActivity || company.lastUpdated || '');
            setSponsorshipTier(company.sponsorshipTier || '');
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
            'Negotiating': 'bg-amber-100 text-amber-700',
            'Interested': 'bg-purple-100 text-purple-700',
            'Completed': 'bg-green-100 text-green-700',
            'Rejected': 'bg-red-100 text-red-700',
            'No Reply': 'bg-gray-100 text-gray-500'
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
                                {status === 'Completed' && <CheckCircleIcon className="w-7 h-7 text-green-400 flex-shrink-0" aria-label="Completed" />}
                                {status === 'Rejected' && <XCircleIcon className="w-7 h-7 text-red-400 flex-shrink-0" aria-label="Rejected" />}
                                {status === 'Negotiating' && <ClockIconSolid className="w-7 h-7 text-amber-400 flex-shrink-0" aria-label="Negotiating" />}
                                {canEdit && isEditMode ? (
                                    <input
                                        type="text"
                                        value={editedName}
                                        onChange={(e) => {
                                            setEditedName(e.target.value);
                                            setHasUnsavedChanges(true);
                                            setShowUnsavedWarning(true);
                                        }}
                                        className="text-2xl font-bold bg-white/20 text-white border-b border-white/40 focus:outline-none focus:border-white px-2 py-1 rounded"
                                    />
                                ) : (
                                    <h1 className="text-2xl font-bold text-white truncate">
                                        {company.companyName || company.name}
                                    </h1>
                                )}
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
                                {isCommitteeStalled && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold border border-red-200">
                                        <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                                        ACTION NEEDED
                                    </span>
                                )}
                                {isCompanyStalled && company.status === 'Contacted' && (
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
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(company.status)}`}>
                                    {company.status}
                                </span>
                                {(company.status === 'Contacted' || (followUpsCompleted || 0) > 0) && (
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
                            <div>
                                <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-2">Update Status</label>
                                <select
                                    id="status"
                                    value={status}
                                    onChange={(e) => {
                                        setStatus(e.target.value);
                                        setHasUnsavedChanges(true);
                                        setShowUnsavedWarning(true);
                                    }}
                                    disabled={!canEdit}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                                >
                                    {statusOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Channel */}
                            <div>
                                <label htmlFor="channel" className="block text-sm font-medium text-slate-700 mb-2 font-semibold">Outreach Channel</label>
                                <input
                                    type="text"
                                    id="channel"
                                    value={channel}
                                    onChange={(e) => setChannel(e.target.value)}
                                    placeholder="e.g. LinkedIn, Email, Phone"
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900"
                                />
                            </div>

                            {/* Sponsorship Tier - Show when status is Interested or Registered */}
                            {(status === 'Interested' || status === 'Registered') && (
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
                                        {status === 'Registered'
                                            ? 'Please select the sponsorship tier the company has committed to.'
                                            : 'Please select the sponsorship tier the company is interested in.'}
                                    </p>
                                </div>
                            )}

                            {/* Days Attending */}
                            {(status === 'Interested' || status === 'Registered') && (
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
                                    placeholder={status === 'Rejected' ? 'Please provide rejection reason...' : 'Add context about this update...'}
                                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 resize-none disabled:bg-slate-50 disabled:cursor-not-allowed ${status === 'Rejected' ? 'border-red-300 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-500'}`}
                                />
                                {status === 'Rejected' && !remarks.trim() && (
                                    <p className="mt-1 text-xs text-red-600">A rejection reason is required when marking as Rejected.</p>
                                )}
                            </div>

                            {/* Quick Actions Replaced by InteractionSection */}
                            <InteractionSection
                                status={status}
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
                                            setNewContact({ name: '', phone: '', email: '', role: '', linkedin: '', remark: '', isActive: false });
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
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newContact.isActive}
                                            onChange={(e) => setNewContact({ ...newContact, isActive: e.target.checked })}
                                            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                        />
                                        <span className="text-sm text-slate-700">Mark as active contact (will receive emails)</span>
                                    </label>
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
                                            ? 'bg-amber-50 border-amber-200'
                                            : 'border-slate-200 hover:border-blue-300'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-slate-900">{contact.name}</h4>
                                                    {contact.role && <span className="text-xs text-slate-500 py-0.5 px-2 bg-slate-100 rounded-full">{contact.role}</span>}
                                                    {contact.isActive && <span className="text-xs text-green-700 py-0.5 px-2 bg-green-100 rounded-full font-medium">Active</span>}
                                                </div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                                    {contact.phone && <div className="text-sm text-slate-600 flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{contact.phone}</div>}
                                                    {contact.email && <div className="text-sm text-slate-600 flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{contact.email}</div>}
                                                </div>
                                                {contact.remark && <p className="text-xs text-slate-500 mt-2 italic">"{contact.remark}"</p>}
                                            </div>
                                            {canEdit && (
                                                <div className="flex gap-1">
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
                                                </div>
                                            )}
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
