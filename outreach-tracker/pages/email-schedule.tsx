import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import ConfirmModal from '../components/ConfirmModal';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';
import { useCurrentUser } from '../contexts/CurrentUserContext';
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
    note?: string;
    completed?: string;
}

/** Unique id for one schedule block (one company in one date/time slot). */
function entryId(e: ScheduleEntry): string {
    return `${e.companyId}|${e.date}|${e.time}`;
}

type ScheduleRowResolve = { openId: string; label: string };

/**
 * Map schedule row → company to open / label using live `/api/data` companies.
 * Fixes stale col A (e.g. deleted ME-0001) when col B still matches a unique live company name,
 * and fixes wrong-but-existing ids when the sheet name matches a different unique company.
 */
function buildScheduleRowResolver(companies: CompanyAssignment[]): (e: ScheduleEntry) => ScheduleRowResolve {
    const canonicalByIdLower = new Map<string, { id: string; companyName: string }>();
    const nameToIds = new Map<string, string[]>();
    for (const c of companies) {
        const id = (c.id || '').trim();
        if (!id) continue;
        const name = (c.companyName || '').trim();
        canonicalByIdLower.set(id.toLowerCase(), { id, companyName: name || id });
        const nk = name.toLowerCase();
        if (!nk) continue;
        if (!nameToIds.has(nk)) nameToIds.set(nk, []);
        nameToIds.get(nk)!.push(id);
    }

    return (e: ScheduleEntry) => {
        const rawId = (e.companyId || '').trim();
        const nameFromSheet = (e.companyName || '').trim();
        const nameKey = nameFromSheet.toLowerCase();
        const idsForName = nameKey ? nameToIds.get(nameKey) : undefined;
        const uniqueNameId = idsForName?.length === 1 ? idsForName[0] : null;
        const nameHit = uniqueNameId ? canonicalByIdLower.get(uniqueNameId.toLowerCase()) : undefined;
        const idHit = rawId ? canonicalByIdLower.get(rawId.toLowerCase()) : undefined;

        const namesAgree =
            Boolean(idHit && nameFromSheet && idHit.companyName.trim().toLowerCase() === nameKey);

        if (nameHit && nameFromSheet) {
            if (!idHit || !namesAgree) {
                return { openId: nameHit.id, label: nameHit.companyName };
            }
        }
        if (idHit) {
            return { openId: idHit.id, label: idHit.companyName };
        }
        return { openId: rawId, label: e.companyName || rawId };
    };
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
    contactStatus?: string;
    relationshipStatus?: string;
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
    displayCompanyName,
    isSelected,
    isDragging,
    isCompleted,
    isReadOnly,
    viewMode,
    onSelect,
    onDoubleClick,
}: {
    entry: ScheduleEntry;
    /** When set, shown instead of entry.companyName (live name / resolved label). */
    displayCompanyName?: string;
    isSelected: boolean;
    isDragging: boolean;
    isCompleted?: boolean;
    isReadOnly?: boolean;
    viewMode?: 'full' | 'compact';
    onSelect: (e: React.MouseEvent) => void;
    onDoubleClick?: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: entryId(entry),
        disabled: isReadOnly,
    });
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

    const isDone = isCompleted === true;
    const chipStyle = isSelected
        ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50'
        : isDone
            ? 'border-green-400 bg-green-50 hover:bg-green-100'
            : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group relative flex items-center gap-2 px-2 py-1.5 rounded-lg border min-w-0 w-full
                transition-colors overflow-hidden select-none
                ${isReadOnly ? 'cursor-default' : 'touch-none'}
                ${chipStyle}
                ${isDragging ? 'opacity-30' : ''}
            `}
        >
            <button
                type="button"
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left outline-none overflow-hidden select-none"
                onClick={isReadOnly ? undefined : onSelect}
                onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
                title={onDoubleClick ? 'Double-click to open company details' : undefined}
                {...(isReadOnly ? {} : listeners)}
                {...(isReadOnly ? {} : attributes)}
            >
                <Bars3Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-slate-800 truncate" title={displayCompanyName ?? entry.companyName}>
                        {displayCompanyName ?? entry.companyName}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${isDone ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                        {entry.pic}
                    </span>
                    {viewMode === 'full' && entry.note && (
                        <p className="text-[10px] text-slate-500 italic truncate mt-0.5" title={entry.note}>
                            {entry.note}
                        </p>
                    )}
                </div>
            </button>
            {(isSelected || isDone) && (
                <span className={`absolute top-1 right-1 ${isSelected ? 'text-indigo-600' : 'text-green-600'}`} aria-hidden title={isDone ? 'Completed' : undefined}>
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
    isReadOnly,
    viewMode,
    resolveRow,
    onSelectChip,
    onDoubleClickChip,
}: {
    date: string;
    slotTime: string;
    blocked: boolean;
    entries: ScheduleEntry[];
    emailsPerBatch: number;
    selectedIds: Set<string>;
    activeId: string | null;
    isReadOnly?: boolean;
    viewMode?: 'full' | 'compact';
    resolveRow: (e: ScheduleEntry) => ScheduleRowResolve;
    onSelectChip: (entry: ScheduleEntry, e: React.MouseEvent) => void;
    onDoubleClickChip?: (entry: ScheduleEntry) => void;
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
                        <div key={entryId(entry)} className={`w-full flex items-center ${viewMode === 'full' && entry.note ? 'min-h-[52px]' : 'min-h-[40px]'}`}>
                            <ScheduleChip
                                entry={entry}
                                displayCompanyName={resolveRow(entry).label}
                                isSelected={selectedIds.has(entryId(entry))}
                                isDragging={!isReadOnly && activeId !== null && (activeId === entryId(entry) || selectedIds.has(entryId(entry)))}
                                isCompleted={entry.completed === 'Y'}
                                isReadOnly={isReadOnly}
                                viewMode={viewMode}
                                onSelect={e => onSelectChip(entry, e)}
                                onDoubleClick={onDoubleClickChip ? () => onDoubleClickChip(entry) : undefined}
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

const SESSION_KEY_DATE = 'emailScheduleCenterDate';
const SESSION_KEY_SCROLL = 'emailScheduleScrollY';

function EmailScheduleContent() {
    const { addTask, completeTask, failTask } = useBackgroundTasks();
    const { user, loading: userLoading, effectiveIsAdmin } = useCurrentUser();
    const router = useRouter();

    // Redirect unauthenticated users to home
    useEffect(() => {
        if (!userLoading && !user) {
            router.push('/');
        }
    }, [userLoading, user, router]);

    const [entries, setEntries] = useState<ScheduleEntry[]>([]);
    const [allAssignments, setAllAssignments] = useState<CompanyAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<CommitteeMember[]>([]);
    const [centerDate, setCenterDate] = useState<Date>(() => {
        if (typeof window !== 'undefined') {
            const stored = sessionStorage.getItem(SESSION_KEY_DATE);
            if (stored) return new Date(stored);
        }
        return new Date();
    });
    const scrollRestoredRef = useRef(false);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    const [moveDate, setMoveDate] = useState('');
    const [moveTime, setMoveTime] = useState('');
    const [moveError, setMoveError] = useState<string | null>(null);
    const [bulkEditPic, setBulkEditPic] = useState('');
    const [bulkDeleteCount, setBulkDeleteCount] = useState<number | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE_SETTINGS);
    const [viewMode, setViewMode] = useState<'full' | 'compact'>('compact');
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);
    const [gridSyncing, setGridSyncing] = useState(false);

    const fetchEntries = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent === true;
        if (silent) {
            setGridSyncing(true);
        } else {
            setLoading(true);
        }
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
                setAllAssignments(companies.map((c: { id: string; companyName?: string; pic?: string; contactStatus?: string; relationshipStatus?: string }) => ({
                    id: c.id,
                    companyName: c.companyName || c.id,
                    pic: (c.pic && String(c.pic).trim()) ? String(c.pic).trim() : 'Unassigned',
                    contactStatus: c.contactStatus || '',
                    relationshipStatus: c.relationshipStatus || '',
                })));
            }
        } catch (e) {
            console.error('Failed to fetch schedule', e);
        } finally {
            if (silent) {
                setGridSyncing(false);
            } else {
                setLoading(false);
            }
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

    const resolveScheduleRow = useMemo(
        () => buildScheduleRowResolver(allAssignments),
        [allAssignments],
    );

    useEffect(() => {
        fetchEntries();
        fetchSettings();
        fetchMembers();
    }, [fetchEntries, fetchSettings, fetchMembers]);

    // Restore scroll position when returning from a company detail page.
    // centerDate is already seeded from sessionStorage during useState initialisation;
    // here we just restore the Y offset after the page has rendered.
    useEffect(() => {
        if (scrollRestoredRef.current) return;
        scrollRestoredRef.current = true;
        sessionStorage.removeItem(SESSION_KEY_DATE);
        const storedY = sessionStorage.getItem(SESSION_KEY_SCROLL);
        if (storedY !== null) {
            sessionStorage.removeItem(SESSION_KEY_SCROLL);
            const y = parseInt(storedY, 10);
            // Wait one tick for the DOM to paint before scrolling.
            requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }));
        }
    }, []);

    const navigateToCompany = useCallback((companyId: string) => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(SESSION_KEY_DATE, centerDate.toISOString());
            sessionStorage.setItem(SESSION_KEY_SCROLL, String(window.scrollY));
        }
        router.push(`/companies/${encodeURIComponent(companyId)}?from=email-schedule`);
    }, [router, centerDate]);

    const handleOpenCompanyFromSchedule = useCallback(
        (entry: ScheduleEntry) => {
            navigateToCompany(resolveScheduleRow(entry).openId);
        },
        [navigateToCompany, resolveScheduleRow],
    );

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

    // Order used for shift-click range: must match exact render order (visible week only).
    // Grid renders: for each date in visibleDates, for each slot in visibleTimeSlots, then slot entries.
    const entriesInVisibleOrder = useMemo(() => {
        const list: ScheduleEntry[] = [];
        for (const group of dateGroups) {
            for (const slot of visibleTimeSlots) {
                const slotEntries = group.entries
                    .filter(e => normalizeTime(e.time) === slot.time)
                    .sort((a, b) => a.order - b.order);
                list.push(...slotEntries);
            }
        }
        return list;
    }, [dateGroups, visibleTimeSlots]);

    const handleSelectChip = useCallback((entry: ScheduleEntry, e: React.MouseEvent) => {
        const id = entryId(entry);
        if (e.shiftKey) {
            setSelectedIds(prev => {
                if (!lastSelectedKey) return new Set([id]);
                const idxLast = entriesInVisibleOrder.findIndex(x => entryId(x) === lastSelectedKey);
                const idxCur = entriesInVisibleOrder.findIndex(x => entryId(x) === id);
                if (idxLast === -1 || idxCur === -1) return new Set([id]);
                const [lo, hi] = idxLast <= idxCur ? [idxLast, idxCur] : [idxCur, idxLast];
                const next = new Set(prev);
                for (let i = lo; i <= hi; i++) next.add(entryId(entriesInVisibleOrder[i]));
                return next;
            });
            setLastSelectedKey(id);
            return;
        }
        if (e.metaKey || e.ctrlKey) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            setLastSelectedKey(id);
            return;
        }
        setSelectedIds(new Set([id]));
        setLastSelectedKey(id);
    }, [lastSelectedKey, entriesInVisibleOrder]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedIds(new Set());
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = event.active.id as string;
        setActiveId(id);
        setSelectedIds(prev => {
            if (prev.has(id)) return prev;
            return new Set([id]);
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

            const movingEntries = freshEntries.filter(e => movingIds.has(entryId(e)));
            if (movingEntries.length === 0) {
                completeTask(taskId, 'Schedule updated');
                setSelectedIds(new Set());
                return;
            }

            const normTime = normalizeTime(targetTime);
            const slotBlocked = visibleTimeSlots.some(s => s.time === normTime && s.blocked);
            if (slotBlocked) {
                completeTask(taskId, 'Schedule updated');
                fetchEntries({ silent: true });
                return;
            }

            const emailsPerBatch = settings.emailsPerBatch;
            const entriesOnTargetDate = freshEntries.filter(e => e.date === targetDate && !movingIds.has(entryId(e)));
            const occupancy = new Map<string, number>();
            entriesOnTargetDate.forEach(e => {
                const t = normalizeTime(e.time);
                occupancy.set(t, (occupancy.get(t) || 0) + 1);
            });
            const newSlots = computeTimeSlotsWithOccupancy(occupancy, normTime, movingEntries.length, settings);
            if (newSlots.length !== movingEntries.length) {
                completeTask(taskId, 'Schedule updated');
                fetchEntries({ silent: true });
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
                let next = prev.filter(e => !movingIds.has(entryId(e)));
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
            fetchEntries({ silent: true });
        } catch {
            failTask(taskId, 'Failed to update schedule');
            fetchEntries({ silent: true });
        }
    }, [selectedIds, settings, visibleTimeSlots, addTask, completeTask, failTask, fetchEntries]);

    const selectedEntries = useMemo(
        () => entries.filter(e => selectedIds.has(entryId(e))),
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
            const movingEntries = freshEntries.filter(e => movingIds.has(entryId(e)));
            if (movingEntries.length === 0) {
                completeTask(taskId, 'Schedule updated');
                setSelectedIds(new Set());
                setMoveDate('');
                setMoveTime('');
                return;
            }

            const entriesOnTargetDate = freshEntries.filter(e => e.date === targetDate && !movingIds.has(entryId(e)));
            const occupancy = new Map<string, number>();
            entriesOnTargetDate.forEach(e => {
                const t = normalizeTime(e.time);
                occupancy.set(t, (occupancy.get(t) || 0) + 1);
            });
            const newSlots = computeTimeSlotsWithOccupancy(occupancy, normTime, movingEntries.length, settings);
            if (newSlots.length !== movingEntries.length) {
                setMoveError('Not enough capacity at that time (rate limit would be exceeded)');
                completeTask(taskId, 'Schedule updated');
                fetchEntries({ silent: true });
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
                let next = prev.filter(e => !movingIds.has(entryId(e)));
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
            fetchEntries({ silent: true });
        } catch {
            failTask(taskId, 'Failed to update schedule');
            fetchEntries({ silent: true });
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
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error('Save failed');
            completeTask(taskId, 'PIC updated');
            // Merge server response into state so we don't refetch (avoids stale cache showing old date/committee)
            const savedEntries = json.entries as ScheduleEntry[] | undefined;
            if (Array.isArray(savedEntries) && savedEntries.length > 0) {
                setEntries(prev => {
                    const byKey = new Map(prev.map(e => [`${e.companyId}|${e.date}`, e]));
                    savedEntries.forEach(e => byKey.set(`${e.companyId}|${e.date}`, { ...e, order: e.order ?? 0 }));
                    return Array.from(byKey.values()).sort((a, b) =>
                        a.date.localeCompare(b.date) || normalizeTime(a.time).localeCompare(normalizeTime(b.time)) || a.order - b.order
                    );
                });
            }
        } catch {
            failTask(taskId, 'Failed to update PIC');
            fetchEntries({ silent: true });
        }
    }, [selectedEntries, assignPicValue, addTask, completeTask, failTask, fetchEntries]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedEntries.length === 0) return;
        setBulkDeleteCount(null);
        const taskId = addTask('Removing from schedule...');
        const movingIds = new Set(selectedIds);
        setEntries(prev => prev.filter(e => !movingIds.has(entryId(e))));
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
            fetchEntries({ silent: true });
        } catch {
            failTask(taskId, 'Failed to remove from schedule');
            fetchEntries({ silent: true });
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

    const activeEntry = activeId ? entries.find(e => entryId(e) === activeId) : null;
    const movingCount = activeId ? (selectedIds.has(activeId) ? selectedIds.size : 1) : 0;
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    if (userLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
            </div>
        );
    }

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
                    {!effectiveIsAdmin && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            View only
                        </span>
                    )}
                    <button
                        onClick={() => fetchEntries()}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setViewMode(v => v === 'compact' ? 'full' : 'compact')}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${viewMode === 'full' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                        title={viewMode === 'full' ? 'Switch to compact view' : 'Switch to full view (shows notes)'}
                    >
                        {viewMode === 'full' ? (
                            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>Compact</>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M3 10h18M3 15h18M3 20h18" /></svg>Full</>
                        )}
                    </button>
                    {effectiveIsAdmin && (
                        <button
                            onClick={() => setShowSettings(s => !s)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showSettings ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                        >
                            <Cog6ToothIcon className="w-4 h-4" />
                            Settings
                        </button>
                    )}
                </div>
            </div>

            {effectiveIsAdmin && showSettings && (
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

            {effectiveIsAdmin && !loading && (members.length > 0 || assignmentBalanceStats.length > 0) && (
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
                <>
            {gridSyncing && (
                <div className="mb-3 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 flex items-center gap-2">
                    <div className="flex-shrink-0 w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-medium text-indigo-700">Syncing schedule…</span>
                </div>
            )}
            <p className="mb-3 text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm border border-green-400 bg-green-100" aria-hidden />
                Green border = email sent
            </p>
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
                                                    isReadOnly={!effectiveIsAdmin}
                                                    viewMode={viewMode}
                                                    resolveRow={resolveScheduleRow}
                                                    onSelectChip={handleSelectChip}
                                                    onDoubleClickChip={handleOpenCompanyFromSchedule}
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
                                    <p className="text-sm font-medium text-slate-800 truncate max-w-[180px]">{resolveScheduleRow(activeEntry).label}</p>
                                    {movingCount > 1 && (
                                        <span className="text-xs text-indigo-600 font-medium">+{movingCount - 1} more</span>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
                </>
            )}

            {effectiveIsAdmin && selectedIds.size >= 1 && (
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
    return <EmailScheduleContent />;
}
