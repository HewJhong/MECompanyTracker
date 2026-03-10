import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import AdminRoute from '../components/AdminRoute';
import ConfirmModal from '../components/ConfirmModal';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
    CalendarDaysIcon,
    Cog6ToothIcon,
    PlusIcon,
    TrashIcon,
    CheckIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    Bars3Icon,
    PencilSquareIcon,
    ArrowRightIcon,
    UserGroupIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from '@heroicons/react/24/outline';
import {
    formatTime,
    DEFAULT_SCHEDULE_SETTINGS,
    ScheduleSettings,
    BlockedPeriod,
    getVisibleTimeSlots,
    computeTimeSlotsWithOccupancy,
    normalizeTime,
} from '../lib/schedule-calculator';

interface ScheduleEntry {
    companyId: string;
    companyName: string;
    pic: string;
    date: string;
    time: string;
    order: number;
}

interface CommitteeMember {
    name: string;
    email: string;
    role: string;
}

interface CompanyAssignment {
    id: string;
    companyName: string;
    pic: string;
}

type DateGroup = {
    date: string;
    label: string;
    entries: ScheduleEntry[];
};

type PicAssignmentStats = {
    pic: string;
    count: number;
    countWithTime: number;
    countWithoutTime: number;
    companies: { companyId: string; companyName: string }[];
    companiesWithTime: { companyId: string; companyName: string }[];
    companiesWithoutTime: { companyId: string; companyName: string }[];
};

function AssignmentBalanceChart({
    stats,
    members,
}: {
    stats: PicAssignmentStats[];
    members: CommitteeMember[];
}) {
    const [expandedPic, setExpandedPic] = useState<string | null>(null);
    const maxCount = Math.max(1, ...stats.map(s => s.count));
    // Include members with 0 assigned so balance is visible
    const allPics = useMemo(() => {
        const byPic = new Map<string, PicAssignmentStats>();
        members.forEach(m => byPic.set(m.name, {
            pic: m.name,
            count: 0,
            countWithTime: 0,
            countWithoutTime: 0,
            companies: [],
            companiesWithTime: [],
            companiesWithoutTime: [],
        }));
        stats.forEach(s => byPic.set(s.pic, s));
        return Array.from(byPic.values()).sort((a, b) => b.count - a.count);
    }, [stats, members]);

    if (allPics.length === 0) return null;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-sm font-semibold text-slate-800">Assignment balance by committee member</h2>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-slate-300" aria-hidden />
                        Assigned, no time yet
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-indigo-400" aria-hidden />
                        Assigned with time
                    </span>
                </div>
            </div>
            <div className="p-4 space-y-3">
                {allPics.map(({ pic, count, countWithTime, countWithoutTime, companies, companiesWithTime, companiesWithoutTime }) => {
                    const pctTotal = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    const pctWithTime = count > 0 ? (countWithTime / count) * pctTotal : 0;
                    const pctWithoutTime = count > 0 ? (countWithoutTime / count) * pctTotal : 0;
                    const isExpanded = expandedPic === pic;
                    return (
                        <div key={pic} className="rounded-lg border border-slate-100 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setExpandedPic(isExpanded ? null : pic)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                            >
                                <span className="text-sm font-medium text-slate-800 w-32 shrink-0 truncate" title={pic}>
                                    {pic}
                                </span>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden flex">
                                        {countWithoutTime > 0 && (
                                            <div
                                                className="h-full bg-slate-300 transition-all duration-300 min-w-0 shrink-0"
                                                style={{ width: `${pctWithoutTime}%` }}
                                                title={`${countWithoutTime} assigned, no time yet`}
                                            />
                                        )}
                                        {countWithTime > 0 && (
                                            <div
                                                className="h-full bg-indigo-400 transition-all duration-300 min-w-0 shrink-0"
                                                style={{ width: `${pctWithTime}%` }}
                                                title={`${countWithTime} with scheduled time`}
                                            />
                                        )}
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 tabular-nums w-16 text-right" title={`${countWithoutTime} without time, ${countWithTime} with time`}>
                                        {count}
                                        {(countWithTime > 0 || countWithoutTime > 0) && (
                                            <span className="text-slate-400 font-normal text-xs ml-0.5">
                                                ({countWithTime}/{countWithoutTime})
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {companies.length > 0 && (
                                    isExpanded ? (
                                        <ChevronUpIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                    ) : (
                                        <ChevronDownIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                    )
                                )}
                            </button>
                            {isExpanded && companies.length > 0 && (
                                <div className="px-3 pb-3 pt-0 border-t border-slate-50 space-y-2">
                                    {companiesWithTime.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-1">With scheduled time ({companiesWithTime.length})</p>
                                            <ul className="text-xs text-slate-600 space-y-0.5 max-h-28 overflow-y-auto">
                                                {companiesWithTime.map(c => (
                                                    <li key={c.companyId} className="truncate" title={c.companyName}>{c.companyName}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {companiesWithoutTime.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">No time yet ({companiesWithoutTime.length})</p>
                                            <ul className="text-xs text-slate-600 space-y-0.5 max-h-28 overflow-y-auto">
                                                {companiesWithoutTime.map(c => (
                                                    <li key={c.companyId} className="truncate" title={c.companyName}>{c.companyName}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

async function fetchScheduleEntriesFromApi(): Promise<ScheduleEntry[]> {
    const res = await fetch('/api/email-schedule');
    if (!res.ok) throw new Error('Failed to fetch schedule');
    const json = await res.json();
    return json.entries || [];
}

/** Returns the 7 dates (YYYY-MM-DD) for the week containing the given date: Sunday first, Saturday last. */
function getWeekDates(weekContainingDate: Date): string[] {
    const d = new Date(weekContainingDate);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(sunday);
        day.setDate(sunday.getDate() + i);
        dates.push(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
    }
    return dates;
}

function ScheduleChip({
    entry,
    isSelected,
    isDragging,
    onSelect,
}: {
    entry: ScheduleEntry;
    isSelected: boolean;
    isDragging: boolean;
    onSelect: (e: React.MouseEvent) => void;
}) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: entry.companyId,
    });
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group relative flex items-center gap-2 px-2 py-1.5 rounded-lg border min-w-0 w-full
                transition-colors touch-none overflow-hidden
                ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'}
                ${isDragging ? 'opacity-30' : ''}
            `}
        >
            <button
                type="button"
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left outline-none overflow-hidden"
                onClick={onSelect}
                {...listeners}
                {...attributes}
            >
                <Bars3Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-slate-800 truncate" title={entry.companyName}>
                        {entry.companyName}
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        {entry.pic}
                    </span>
                </div>
            </button>
            {isSelected && (
                <span className="absolute top-1 right-1 text-indigo-600" aria-hidden>
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                </span>
            )}
        </div>
    );
}

function DroppableSlotBlock({
    date,
    slotTime,
    blocked,
    entries,
    emailsPerBatch,
    selectedIds,
    activeId,
    onSelectChip,
}: {
    date: string;
    slotTime: string;
    blocked: boolean;
    entries: ScheduleEntry[];
    emailsPerBatch: number;
    selectedIds: Set<string>;
    activeId: string | null;
    onSelectChip: (entry: ScheduleEntry, e: React.MouseEvent) => void;
}) {
    const droppableId = `${date}|${slotTime}`;
    const { setNodeRef, isOver } = useDroppable({
        id: droppableId,
        disabled: blocked,
    });

    const slotFull = entries.length >= emailsPerBatch;
    const movingCount = activeId ? (selectedIds.has(activeId) ? selectedIds.size : 1) : 0;
    const wouldOverflow = !blocked && movingCount > 0 && slotFull;
    const highlight = !blocked && isOver && (wouldOverflow ? 'ring-2 ring-amber-400 bg-amber-50' : 'ring-2 ring-green-400 bg-green-50');

    const sortedEntries = [...entries].sort((a, b) => a.order - b.order);
    const hasAny = sortedEntries.length > 0;

    return (
        <div
            ref={setNodeRef}
            className={`
                flex gap-2 rounded-lg border overflow-hidden transition-colors
                ${blocked ? 'bg-slate-100 border-slate-200 border-dashed' : 'border-slate-100'}
                ${highlight || ''}
            `}
        >
            <div className="w-14 shrink-0 flex flex-col justify-center py-2 pl-2 border-r border-slate-100 bg-slate-50/50">
                <span className={`text-xs font-medium ${blocked ? 'text-slate-400' : 'text-slate-600'}`}>
                    {formatTime(slotTime)}
                </span>
                {slotFull && !blocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 mt-1 w-fit">Full</span>
                )}
            </div>
            <div className="flex-1 flex flex-col gap-1.5 py-2 pr-2 min-w-0 w-0">
                {hasAny ? (
                    sortedEntries.map(entry => (
                        <div key={`${entry.companyId}-${entry.date}`} className="min-h-[40px] w-full flex items-center">
                            <ScheduleChip
                                entry={entry}
                                isSelected={selectedIds.has(entry.companyId)}
                                isDragging={activeId !== null && (activeId === entry.companyId || selectedIds.has(entry.companyId))}
                                onSelect={e => onSelectChip(entry, e)}
                            />
                        </div>
                    ))
                ) : !blocked ? (
                    <div className="min-h-[40px] w-full flex items-center">
                        <span className="text-[10px] text-slate-300">Drop here</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function EmailScheduleContent() {
    const { addTask, completeTask, failTask } = useBackgroundTasks();

    const [entries, setEntries] = useState<ScheduleEntry[]>([]);
    const [allAssignments, setAllAssignments] = useState<CompanyAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<CommitteeMember[]>([]);
    const [centerDate, setCenterDate] = useState<Date>(() => new Date());

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    const [moveDate, setMoveDate] = useState('');
    const [moveTime, setMoveTime] = useState('');
    const [moveError, setMoveError] = useState<string | null>(null);
    const [bulkEditPic, setBulkEditPic] = useState('');
    const [bulkDeleteCount, setBulkDeleteCount] = useState<number | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE_SETTINGS);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const [scheduleRes, dataRes] = await Promise.all([
                fetch('/api/email-schedule'),
                fetch('/api/data'),
            ]);
            if (scheduleRes.ok) {
                const json = await scheduleRes.json();
                setEntries(json.entries || []);
            }
            if (dataRes.ok) {
                const json = await dataRes.json();
                const companies = json.companies || [];
                setAllAssignments(companies.map((c: { id: string; companyName?: string; pic?: string }) => ({
                    id: c.id,
                    companyName: c.companyName || c.id,
                    pic: (c.pic && String(c.pic).trim()) ? String(c.pic).trim() : 'Unassigned',
                })));
            }
        } catch (e) {
            console.error('Failed to fetch schedule', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/email-schedule/settings');
            if (res.ok) {
                const json = await res.json();
                setSettings(json.settings || DEFAULT_SCHEDULE_SETTINGS);
            }
        } catch {
            setSettings(DEFAULT_SCHEDULE_SETTINGS);
        }
    }, []);

    const fetchMembers = useCallback(async () => {
        try {
            const res = await fetch('/api/committee-members');
            if (res.ok) {
                const json = await res.json();
                setMembers(json.members || []);
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        fetchEntries();
        fetchSettings();
        fetchMembers();
    }, [fetchEntries, fetchSettings, fetchMembers]);

    const visibleDates = getWeekDates(centerDate);
    const visibleTimeSlots = useMemo(
        () => getVisibleTimeSlots(settings, entries),
        [settings, entries],
    );

    const dateGroups: DateGroup[] = useMemo(() => visibleDates.map(date => ({
        date,
        label: formatDateLabel(date),
        entries: entries
            .filter(e => e.date === date)
            .sort((a, b) => normalizeTime(a.time).localeCompare(normalizeTime(b.time)) || a.order - b.order),
    })), [visibleDates, entries]);

    const assignmentBalanceStats: PicAssignmentStats[] = useMemo(() => {
        const scheduledByPic = new Map<string, Set<string>>();
        entries.forEach(e => {
            const pic = e.pic?.trim() || 'Unassigned';
            if (!scheduledByPic.has(pic)) scheduledByPic.set(pic, new Set());
            scheduledByPic.get(pic)!.add(e.companyId);
        });
        const byPic = new Map<string, { companies: Map<string, string> }>();
        allAssignments.forEach(c => {
            const pic = c.pic || 'Unassigned';
            if (!byPic.has(pic)) byPic.set(pic, { companies: new Map() });
            byPic.get(pic)!.companies.set(c.id, c.companyName);
        });
        return Array.from(byPic.entries())
            .map(([pic, { companies }]) => {
                const scheduledIds = scheduledByPic.get(pic) || new Set<string>();
                const list = Array.from(companies.entries()).map(([companyId, companyName]) => ({ companyId, companyName }));
                const withTime = list.filter(x => scheduledIds.has(x.companyId));
                const withoutTime = list.filter(x => !scheduledIds.has(x.companyId));
                return {
                    pic,
                    count: companies.size,
                    countWithTime: withTime.length,
                    countWithoutTime: withoutTime.length,
                    companies: list,
                    companiesWithTime: withTime,
                    companiesWithoutTime: withoutTime,
                };
            })
            .sort((a, b) => b.count - a.count);
    }, [allAssignments, entries]);

    const entriesInDocumentOrder = useMemo(() => {
        const list = [...entries];
        list.sort((a, b) => {
            const d = a.date.localeCompare(b.date);
            if (d !== 0) return d;
            const t = normalizeTime(a.time).localeCompare(normalizeTime(b.time));
            if (t !== 0) return t;
            return a.order - b.order;
        });
        return list;
    }, [entries]);

    const handleSelectChip = useCallback((entry: ScheduleEntry, e: React.MouseEvent) => {
        const id = entry.companyId;
        if (e.shiftKey) {
            setSelectedIds(prev => {
                if (!lastSelectedId) return new Set([id]);
                const idxLast = entriesInDocumentOrder.findIndex(x => x.companyId === lastSelectedId);
                const idxCur = entriesInDocumentOrder.findIndex(x => x.companyId === id);
                if (idxLast === -1 || idxCur === -1) return new Set([id]);
                const [lo, hi] = idxLast <= idxCur ? [idxLast, idxCur] : [idxCur, idxLast];
                const next = new Set(prev);
                for (let i = lo; i <= hi; i++) next.add(entriesInDocumentOrder[i].companyId);
                return next;
            });
            setLastSelectedId(id);
            return;
        }
        if (e.metaKey || e.ctrlKey) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            setLastSelectedId(id);
            return;
        }
        setSelectedIds(new Set([id]));
        setLastSelectedId(id);
    }, [lastSelectedId, entriesInDocumentOrder]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedIds(new Set());
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setSelectedIds(prev => {
            if (prev.has(event.active.id as string)) return prev;
            return new Set([event.active.id as string]);
        });
    }, []);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { over } = event;
        setActiveId(null);

        if (!over?.id || typeof over.id !== 'string') return;

        const overStr = String(over.id);
        if (!overStr.includes('|')) return;
        const parts = overStr.split('|');
        const targetDate = parts[0];
        const targetTime = parts[1];
        if (!targetDate || !targetTime) return;

        const movingIds = new Set(selectedIds);
        if (movingIds.size === 0) return;

        const taskId = addTask('Updating schedule...');

        try {
            const freshEntries = await fetchScheduleEntriesFromApi();
            setEntries(freshEntries);

            const movingEntries = freshEntries.filter(e => movingIds.has(e.companyId));
            if (movingEntries.length === 0) {
                completeTask(taskId, 'Schedule updated');
                setSelectedIds(new Set());
                return;
            }

            const normTime = normalizeTime(targetTime);
            const slotBlocked = visibleTimeSlots.some(s => s.time === normTime && s.blocked);
            if (slotBlocked) {
                completeTask(taskId, 'Schedule updated');
                fetchEntries();
                return;
            }

            const emailsPerBatch = settings.emailsPerBatch;
            const entriesOnTargetDate = freshEntries.filter(e => e.date === targetDate && !movingIds.has(e.companyId));
            const occupancy = new Map<string, number>();
            entriesOnTargetDate.forEach(e => {
                const t = normalizeTime(e.time);
                occupancy.set(t, (occupancy.get(t) || 0) + 1);
            });
            const newSlots = computeTimeSlotsWithOccupancy(occupancy, normTime, movingEntries.length, settings);
            if (newSlots.length !== movingEntries.length) {
                completeTask(taskId, 'Schedule updated');
                fetchEntries();
                return;
            }

            const newEntries: ScheduleEntry[] = movingEntries.map((e, i) => ({
                ...e,
                date: targetDate,
                time: newSlots[i],
                order: i,
            }));

            const oldDates = [...new Set(movingEntries.map(e => e.date))];

            setEntries(prev => {
                let next = prev.filter(e => !movingIds.has(e.companyId));
                next = [...next, ...newEntries];
                next.sort((a, b) => a.date.localeCompare(b.date) || normalizeTime(a.time).localeCompare(normalizeTime(b.time)) || a.order - b.order);
                return next;
            });
            setSelectedIds(new Set());

            for (const date of oldDates) {
                const idsToRemove = movingEntries.filter(e => e.date === date).map(e => e.companyId);
                if (idsToRemove.length === 0) continue;
                const delRes = await fetch('/api/email-schedule', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds: idsToRemove, date }),
                });
                if (!delRes.ok) throw new Error('Delete failed');
            }
            const putRes = await fetch('/api/email-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: newEntries }),
            });
            if (!putRes.ok) throw new Error('Save failed');
            completeTask(taskId, 'Schedule updated');
            fetchEntries();
        } catch {
            failTask(taskId, 'Failed to update schedule');
            fetchEntries();
        }
    }, [selectedIds, settings, visibleTimeSlots, addTask, completeTask, failTask, fetchEntries]);

    const selectedEntries = useMemo(
        () => entries.filter(e => selectedIds.has(e.companyId)),
        [entries, selectedIds],
    );

    const selectedUniquePic = useMemo(() => {
        if (selectedEntries.length === 0) return '';
        const pics = [...new Set(selectedEntries.map(e => e.pic))];
        return pics.length === 1 ? pics[0] : '';
    }, [selectedEntries]);

    const assignPicValue = bulkEditPic || selectedUniquePic;

    useEffect(() => {
        if (selectedUniquePic === '' && selectedEntries.length > 0) {
            setBulkEditPic('');
        }
    }, [selectedUniquePic, selectedEntries.length]);

    const handleBulkMove = useCallback(async () => {
        setMoveError(null);
        if (selectedIds.size === 0) return;
        const targetDate = moveDate.trim();
        const targetTime = moveTime.trim();
        if (!targetDate || !targetTime) {
            setMoveError('Please select date and time');
            return;
        }
        const normTime = normalizeTime(targetTime);
        const slotBlocked = visibleTimeSlots.some(s => s.time === normTime && s.blocked);
        if (slotBlocked) {
            setMoveError('Selected time is in a blocked period');
            return;
        }

        const taskId = addTask('Updating schedule...');

        try {
            const freshEntries = await fetchScheduleEntriesFromApi();
            setEntries(freshEntries);

            const movingIds = new Set(selectedIds);
            const movingEntries = freshEntries.filter(e => movingIds.has(e.companyId));
            if (movingEntries.length === 0) {
                completeTask(taskId, 'Schedule updated');
                setSelectedIds(new Set());
                setMoveDate('');
                setMoveTime('');
                return;
            }

            const entriesOnTargetDate = freshEntries.filter(e => e.date === targetDate && !movingIds.has(e.companyId));
            const occupancy = new Map<string, number>();
            entriesOnTargetDate.forEach(e => {
                const t = normalizeTime(e.time);
                occupancy.set(t, (occupancy.get(t) || 0) + 1);
            });
            const newSlots = computeTimeSlotsWithOccupancy(occupancy, normTime, movingEntries.length, settings);
            if (newSlots.length !== movingEntries.length) {
                setMoveError('Not enough capacity at that time (rate limit would be exceeded)');
                completeTask(taskId, 'Schedule updated');
                fetchEntries();
                return;
            }

            const newEntries: ScheduleEntry[] = movingEntries.map((e, i) => ({
                ...e,
                date: targetDate,
                time: newSlots[i],
                order: i,
            }));

            const oldDates = [...new Set(movingEntries.map(e => e.date))];

            setEntries(prev => {
                let next = prev.filter(e => !movingIds.has(e.companyId));
                next = [...next, ...newEntries];
                next.sort((a, b) => a.date.localeCompare(b.date) || normalizeTime(a.time).localeCompare(normalizeTime(b.time)) || a.order - b.order);
                return next;
            });
            setSelectedIds(new Set());
            setMoveDate('');
            setMoveTime('');

            for (const date of oldDates) {
                const idsToRemove = movingEntries.filter(e => e.date === date).map(e => e.companyId);
                if (idsToRemove.length === 0) continue;
                const delRes = await fetch('/api/email-schedule', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds: idsToRemove, date }),
                });
                if (!delRes.ok) throw new Error('Delete failed');
            }
            const putRes = await fetch('/api/email-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: newEntries }),
            });
            if (!putRes.ok) throw new Error('Save failed');
            completeTask(taskId, 'Schedule updated');
            fetchEntries();
        } catch {
            failTask(taskId, 'Failed to update schedule');
            fetchEntries();
        }
    }, [selectedIds, moveDate, moveTime, visibleTimeSlots, settings, addTask, completeTask, failTask, fetchEntries]);

    const handleBulkPicChange = useCallback(async () => {
        const picToApply = assignPicValue.trim();
        if (selectedEntries.length === 0 || !picToApply) return;
        const taskId = addTask('Updating PIC...');
        const updated = selectedEntries.map(e => ({ ...e, pic: picToApply }));
        setEntries(prev => prev.map(e => {
            const u = updated.find(u => u.companyId === e.companyId && u.date === e.date);
            return u ? { ...e, pic: u.pic } : e;
        }));
        setSelectedIds(new Set());
        setBulkEditPic('');
        try {
            const res = await fetch('/api/email-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: updated }),
            });
            if (!res.ok) throw new Error('Save failed');
            completeTask(taskId, 'PIC updated');
            fetchEntries();
        } catch {
            failTask(taskId, 'Failed to update PIC');
            fetchEntries();
        }
    }, [selectedEntries, assignPicValue, addTask, completeTask, failTask, fetchEntries]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedEntries.length === 0) return;
        setBulkDeleteCount(null);
        const taskId = addTask('Removing from schedule...');
        const movingIds = new Set(selectedIds);
        setEntries(prev => prev.filter(e => !movingIds.has(e.companyId)));
        setSelectedIds(new Set());
        try {
            const byDate = new Map<string, string[]>();
            selectedEntries.forEach(e => {
                if (!byDate.has(e.date)) byDate.set(e.date, []);
                byDate.get(e.date)!.push(e.companyId);
            });
            for (const [date, companyIds] of byDate) {
                const res = await fetch('/api/email-schedule', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds, date }),
                });
                if (!res.ok) throw new Error('Delete failed');
            }
            completeTask(taskId, 'Removed from schedule');
            fetchEntries();
        } catch {
            failTask(taskId, 'Failed to remove from schedule');
            fetchEntries();
        }
    }, [selectedEntries, selectedIds, addTask, completeTask, failTask, fetchEntries]);

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            const res = await fetch('/api/email-schedule/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings }),
            });
            if (!res.ok) throw new Error('Save failed');
            setSettingsSaved(true);
            setTimeout(() => setSettingsSaved(false), 3000);
        } catch {
            // no-op
        } finally {
            setSavingSettings(false);
        }
    };

    const addBlockedPeriod = () => {
        setSettings(s => ({
            ...s,
            blockedPeriods: [...s.blockedPeriods, { label: 'New Period', start: '12:00', end: '13:00' }],
        }));
    };

    const removeBlockedPeriod = (index: number) => {
        setSettings(s => ({
            ...s,
            blockedPeriods: s.blockedPeriods.filter((_, i) => i !== index),
        }));
    };

    const updateBlockedPeriod = (index: number, field: keyof BlockedPeriod, value: string) => {
        setSettings(s => ({
            ...s,
            blockedPeriods: s.blockedPeriods.map((p, i) => i === index ? { ...p, [field]: value } : p),
        }));
    };

    const isToday = (dateStr: string) => dateStr === new Date().toISOString().slice(0, 10);

    const activeEntry = activeId ? entries.find(e => e.companyId === activeId) : null;
    const movingCount = activeId ? (selectedIds.has(activeId) ? selectedIds.size : 1) : 0;
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    return (
        <Layout title="Email Schedule | Outreach Tracker">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                        <CalendarDaysIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Email Schedule</h1>
                        <p className="text-slate-600 mt-0.5">View and manage scheduled outreach emails</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchEntries}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setShowSettings(s => !s)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showSettings ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                        Settings
                    </button>
                </div>
            </div>

            {showSettings && (
                <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">Schedule Configuration</h2>
                        {settingsSaved && (
                            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                                <CheckIcon className="w-4 h-4" /> Saved
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Emails per batch</label>
                            <input
                                type="number"
                                min={1}
                                max={20}
                                value={settings.emailsPerBatch}
                                onChange={e => setSettings(s => ({ ...s, emailsPerBatch: parseInt(e.target.value) || 1 }))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Interval (minutes)</label>
                            <input
                                type="number"
                                min={1}
                                max={120}
                                value={settings.batchIntervalMinutes}
                                onChange={e => setSettings(s => ({ ...s, batchIntervalMinutes: parseInt(e.target.value) || 15 }))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Default start time</label>
                            <input
                                type="time"
                                value={settings.defaultStartTime}
                                onChange={e => setSettings(s => ({ ...s, defaultStartTime: e.target.value }))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-medium text-slate-700">Blocked Periods</label>
                            <button
                                onClick={addBlockedPeriod}
                                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                                <PlusIcon className="w-3.5 h-3.5" /> Add Period
                            </button>
                        </div>
                        <div className="space-y-2">
                            {settings.blockedPeriods.map((period, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={period.label}
                                        onChange={e => updateBlockedPeriod(i, 'label', e.target.value)}
                                        placeholder="Label"
                                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <input
                                        type="time"
                                        value={period.start}
                                        onChange={e => updateBlockedPeriod(i, 'start', e.target.value)}
                                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <span className="text-slate-400 text-sm">to</span>
                                    <input
                                        type="time"
                                        value={period.end}
                                        onChange={e => updateBlockedPeriod(i, 'end', e.target.value)}
                                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <button
                                        onClick={() => removeBlockedPeriod(i)}
                                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {settings.blockedPeriods.length === 0 && (
                                <p className="text-sm text-slate-400 italic">No blocked periods configured.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={handleSaveSettings}
                            disabled={savingSettings}
                            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2 text-sm"
                        >
                            {savingSettings && (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {savingSettings ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            )}

            {!loading && (members.length > 0 || assignmentBalanceStats.length > 0) && (
                <div className="mb-6">
                    <AssignmentBalanceChart stats={assignmentBalanceStats} members={members} />
                </div>
            )}

            <div className="flex items-center gap-4 mb-4">
                <button
                    onClick={() => setCenterDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
                    className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Previous week"
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setCenterDate(new Date())}
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                >
                    Today
                </button>
                <button
                    onClick={() => setCenterDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
                    className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Next week"
                >
                    <ChevronRightIcon className="w-5 h-5" />
                </button>
                <span className="text-sm text-slate-500">
                    {visibleDates[0]} → {visibleDates[visibleDates.length - 1]}
                </span>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex gap-4 overflow-x-auto pb-4">
                        {dateGroups.map(group => (
                            <div
                                key={group.date}
                                className={`flex-shrink-0 w-[320px] min-w-[320px] max-w-[320px] rounded-xl border bg-white shadow-sm flex flex-col ${isToday(group.date) ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}
                            >
                                <div className={`px-4 py-3 rounded-t-xl border-b ${isToday(group.date) ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className={`text-sm font-semibold ${isToday(group.date) ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                {group.label}
                                            </p>
                                            <p className="text-xs text-slate-400">{group.date}</p>
                                        </div>
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${group.entries.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                                            {group.entries.length} {group.entries.length === 1 ? 'email' : 'emails'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 p-2 space-y-1 overflow-y-auto max-h-[520px]">
                                    {visibleTimeSlots.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic text-center py-4">No time slots</p>
                                    ) : (
                                        visibleTimeSlots.map(slot => {
                                            const slotEntries = group.entries.filter(e => normalizeTime(e.time) === slot.time);
                                            return (
                                                <DroppableSlotBlock
                                                    key={slot.time}
                                                    date={group.date}
                                                    slotTime={slot.time}
                                                    blocked={slot.blocked}
                                                    entries={slotEntries}
                                                    emailsPerBatch={settings.emailsPerBatch}
                                                    selectedIds={selectedIds}
                                                    activeId={activeId}
                                                    onSelectChip={handleSelectChip}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <DragOverlay>
                        {activeEntry ? (
                            <div className="px-3 py-2 rounded-lg border-2 border-indigo-300 bg-white shadow-lg opacity-90 flex items-center gap-2">
                                <Bars3Icon className="w-4 h-4 text-slate-400" />
                                <div>
                                    <p className="text-sm font-medium text-slate-800 truncate max-w-[180px]">{activeEntry.companyName}</p>
                                    {movingCount > 1 && (
                                        <span className="text-xs text-indigo-600 font-medium">+{movingCount - 1} more</span>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            )}

            {selectedIds.size >= 1 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl mx-4">
                    <div className="bg-slate-800 text-white rounded-xl shadow-xl p-4 flex flex-col gap-4">
                        <p className="text-sm font-medium">
                            {selectedIds.size} {selectedIds.size === 1 ? 'company' : 'companies'} selected · ESC to clear
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-wrap items-end gap-2">
                                <div>
                                    <label className="block text-xs text-slate-300 mb-0.5">Move to date</label>
                                    <input
                                        type="date"
                                        value={moveDate}
                                        onChange={e => { setMoveDate(e.target.value); setMoveError(null); }}
                                        className="px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-sm text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-300 mb-0.5">Time</label>
                                    <input
                                        type="time"
                                        value={moveTime}
                                        onChange={e => { setMoveTime(e.target.value); setMoveError(null); }}
                                        className="px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-sm text-white"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleBulkMove}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium"
                                >
                                    <ArrowRightIcon className="w-4 h-4" />
                                    Move
                                </button>
                            </div>
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="block text-xs text-slate-300 mb-0.5">Assign PIC</label>
                                    <select
                                        value={assignPicValue}
                                        onChange={e => setBulkEditPic(e.target.value)}
                                        className="px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-sm text-white min-w-[120px]"
                                    >
                                        <option value="">Select PIC</option>
                                        {members.map(m => (
                                            <option key={m.name} value={m.name}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleBulkPicChange}
                                    disabled={!assignPicValue.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-sm font-medium"
                                >
                                    <PencilSquareIcon className="w-4 h-4" />
                                    Apply
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBulkDeleteCount(selectedIds.size)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium"
                            >
                                <TrashIcon className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                        {moveError && (
                            <p className="text-sm text-amber-300">{moveError}</p>
                        )}
                    </div>
                </div>
            )}

            {!loading && entries.length > 0 && (
                <div className="mt-4 flex items-center gap-4 text-sm text-slate-500">
                    <span>{entries.length} total scheduled emails</span>
                    <span>·</span>
                    <span>{new Set(entries.map(e => e.date)).size} dates</span>
                    <span>·</span>
                    <span>{new Set(entries.map(e => e.pic)).size} PICs</span>
                </div>
            )}

            <ConfirmModal
                isOpen={bulkDeleteCount !== null}
                onClose={() => setBulkDeleteCount(null)}
                onConfirm={handleBulkDelete}
                title="Remove from Schedule"
                message={bulkDeleteCount !== null ? `Remove ${bulkDeleteCount} ${bulkDeleteCount === 1 ? 'company' : 'companies'} from the schedule?` : ''}
                confirmText="Remove"
                variant="danger"
            />
        </Layout>
    );
}

export default function EmailSchedulePage() {
    return (
        <AdminRoute>
            <EmailScheduleContent />
        </AdminRoute>
    );
}
