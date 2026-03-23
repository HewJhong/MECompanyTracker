export interface AllowedPeriod {
    label: string;
    start: string; // HH:mm
    end: string;   // HH:mm
}

// Backward-compat alias for legacy code paths.
export type BlockedPeriod = AllowedPeriod;

export interface ScheduleSettings {
    emailsPerBatch: number;
    batchIntervalMinutes: number;
    allowedPeriods: AllowedPeriod[];
    blockedPeriods?: BlockedPeriod[]; // legacy fallback
    defaultStartTime: string;
}

export interface Warning {
    type: 'blocked_period' | 'conflict';
    message: string;
    time?: string;
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
    emailsPerBatch: 3,
    batchIntervalMinutes: 15,
    allowedPeriods: [
        { label: 'Morning', start: '08:00', end: '12:00' },
        { label: 'Afternoon', start: '13:00', end: '16:00' },
    ],
    defaultStartTime: '08:00',
};

export function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
    const totalMinutes = Math.max(0, minutes);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type MinuteInterval = { start: number; end: number }; // [start, end), end exclusive

function normalizePeriodEnd(end: number): number {
    // Allowed period end is inclusive in UX (e.g. 16:00 should allow 16:00 slot),
    // so convert to exclusive upper bound by adding one minute.
    if (!Number.isFinite(end)) return end;
    return Math.min(24 * 60, end + 1);
}

function buildIntervals(periods: AllowedPeriod[]): MinuteInterval[] {
    const raw: MinuteInterval[] = [];
    for (const period of periods) {
        const start = timeToMinutes(period.start);
        const end = normalizePeriodEnd(timeToMinutes(period.end));
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        if (start === end) continue;
        if (start < end) {
            raw.push({ start: Math.max(0, start), end: Math.min(24 * 60, end) });
        } else {
            // Overnight block, e.g. 22:00 -> 07:00
            raw.push({ start: Math.max(0, start), end: 24 * 60 });
            raw.push({ start: 0, end: Math.min(24 * 60, end) });
        }
    }
    raw.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: MinuteInterval[] = [];
    for (const interval of raw) {
        if (interval.start >= interval.end) continue;
        const last = merged[merged.length - 1];
        if (!last || interval.start > last.end) {
            merged.push({ ...interval });
        } else {
            last.end = Math.max(last.end, interval.end);
        }
    }
    return merged;
}

function getAllowedPeriods(settingsOrPeriods: ScheduleSettings | AllowedPeriod[]): AllowedPeriod[] {
    if (Array.isArray(settingsOrPeriods)) return settingsOrPeriods;
    if (Array.isArray(settingsOrPeriods.allowedPeriods) && settingsOrPeriods.allowedPeriods.length > 0) {
        return settingsOrPeriods.allowedPeriods;
    }
    // Legacy safety path only.
    if (Array.isArray(settingsOrPeriods.blockedPeriods) && settingsOrPeriods.blockedPeriods.length > 0) {
        const blocked = buildIntervals(settingsOrPeriods.blockedPeriods);
        const allowed: MinuteInterval[] = [];
        let cursor = 0;
        for (const b of blocked) {
            if (cursor < b.start) allowed.push({ start: cursor, end: b.start });
            cursor = Math.max(cursor, b.end);
        }
        if (cursor < 24 * 60) allowed.push({ start: cursor, end: 24 * 60 });
        return allowed.map((i, idx) => ({
            label: `Allowed ${idx + 1}`,
            start: minutesToTime(i.start),
            end: i.end >= 24 * 60 ? '23:59' : minutesToTime(i.end),
        }));
    }
    return DEFAULT_SCHEDULE_SETTINGS.allowedPeriods;
}

export function isInBlockedPeriod(minutes: number, periodsOrSettings: BlockedPeriod[] | ScheduleSettings): boolean {
    const allowedIntervals = buildIntervals(getAllowedPeriods(periodsOrSettings));
    return !allowedIntervals.some(i => minutes >= i.start && minutes < i.end);
}

export function skipBlockedPeriods(minutes: number, periodsOrSettings: BlockedPeriod[] | ScheduleSettings): number {
    const allowed = buildIntervals(getAllowedPeriods(periodsOrSettings));
    if (allowed.length === 0) return 24 * 60;
    const current = Math.max(0, minutes);
    for (const interval of allowed) {
        if (current < interval.start) return interval.start;
        if (current >= interval.start && current < interval.end) return current;
    }
    return 24 * 60;
}

/**
 * Computes the scheduled send time for each email.
 * Groups emails into batches of `emailsPerBatch`, each batch separated by `batchIntervalMinutes`.
 * Automatically skips blocked periods when advancing to the next batch.
 *
 * Example: start=08:00, count=9, batch=3, interval=15
 * → [08:00, 08:00, 08:00, 08:15, 08:15, 08:15, 08:30, 08:30, 08:30]
 */
export function calculateTimeSlots(
    startTime: string,
    count: number,
    allowedPeriods: AllowedPeriod[],
    emailsPerBatch = 3,
    batchIntervalMinutes = 15,
): string[] {
    if (count <= 0) return [];

    const startMinutes = skipBlockedPeriods(timeToMinutes(startTime), allowedPeriods);

    const slots: string[] = [];
    let currentBatchStartMinutes = startMinutes;
    let countInCurrentBatch = 0;

    for (let i = 0; i < count; i++) {
        if (countInCurrentBatch >= emailsPerBatch) {
            const nextRaw = currentBatchStartMinutes + batchIntervalMinutes;
            currentBatchStartMinutes = skipBlockedPeriods(nextRaw, allowedPeriods);
            countInCurrentBatch = 0;
        }
        slots.push(minutesToTime(currentBatchStartMinutes));
        countInCurrentBatch++;
    }

    return slots;
}

/** Returns the last time slot (the end time of the schedule). */
export function getEndTime(timeSlots: string[]): string | null {
    if (timeSlots.length === 0) return null;
    return timeSlots[timeSlots.length - 1];
}

/**
 * Checks whether any scheduled time falls within a blocked period.
 * Also validates that all slots are before midnight (< 24:00).
 */
export function checkBlockedPeriodWarnings(
    timeSlots: string[],
    allowedPeriods: AllowedPeriod[],
): Warning[] {
    const warnings: Warning[] = [];
    const seen = new Set<string>();
    const allowedIntervals = buildIntervals(allowedPeriods);

    for (const slot of timeSlots) {
        const slotMinutes = timeToMinutes(slot);

        if (slotMinutes >= 24 * 60) {
            if (!seen.has('overflow')) {
                warnings.push({
                    type: 'blocked_period',
                    message: 'Some emails would be scheduled past midnight.',
                    time: slot,
                });
                seen.add('overflow');
            }
        }
        const inAllowed = allowedIntervals.some(i => slotMinutes >= i.start && slotMinutes < i.end);
        if (!inAllowed && !seen.has('outside-allowed')) {
            warnings.push({
                type: 'blocked_period',
                message: 'Some emails fall outside configured allowed sending periods.',
                time: slot,
            });
            seen.add('outside-allowed');
        }
    }

    return warnings;
}

/** Formats a HH:mm time string to "8:00 AM" display format. */
export function formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Canonical "HH:mm" for consistent slot keys (e.g. "8:00" → "08:00"). */
export function normalizeTime(time: string): string {
    return minutesToTime(timeToMinutes(time));
}

function safeTimeToMinutes(time: string): number | null {
    const str = String(time ?? '').trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(str);
    if (!m) return null;
    const h = Number.parseInt(m[1], 10);
    const mm = Number.parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return h * 60 + mm;
}

export interface VisibleSlot {
    time: string;
    blocked: boolean;
}

/**
 * Builds the ordered list of time-slot rows to show in the schedule grid.
 * Range: from defaultStartTime to endTime (or max time in entries + one slot).
 * Each slot is marked as blocked if it falls inside a blocked period.
 */
export function getVisibleTimeSlots(
    settings: ScheduleSettings,
    entries?: { time: string }[],
): VisibleSlot[] {
    const allowedPeriods = getAllowedPeriods(settings);
    const batchIntervalMinutes =
        Number.isFinite(settings.batchIntervalMinutes) && settings.batchIntervalMinutes > 0
            ? settings.batchIntervalMinutes
            : DEFAULT_SCHEDULE_SETTINGS.batchIntervalMinutes;
    const startMinutesRaw =
        safeTimeToMinutes(settings.defaultStartTime) ?? timeToMinutes(DEFAULT_SCHEDULE_SETTINGS.defaultStartTime);
    const startMinutes = skipBlockedPeriods(startMinutesRaw, allowedPeriods);
    let endMinutes = timeToMinutes('18:00');
    if (entries && entries.length > 0) {
        const validEntryMinutes = entries
            .map(e => safeTimeToMinutes(e.time))
            .filter((v): v is number => v !== null);
        if (validEntryMinutes.length > 0) {
            const maxEntry = Math.max(...validEntryMinutes);
            endMinutes = Math.min(24 * 60, skipBlockedPeriods(maxEntry + batchIntervalMinutes, allowedPeriods));
        }
    }
    const slots: VisibleSlot[] = [];
    let current = startMinutes;
    const maxMinutes = 24 * 60;
    while (current < maxMinutes && current <= endMinutes) {
        const time = minutesToTime(current);
        slots.push({
            time,
            blocked: isInBlockedPeriod(current, allowedPeriods),
        });
        current += batchIntervalMinutes;
    }
    return slots;
}

/**
 * Client-side slot assignment: given an occupancy map (slot time → count),
 * assigns `count` new entries starting at startTime, respecting batch limit and blocked periods.
 * Returns the array of slot times for the new entries.
 */
export function computeTimeSlotsWithOccupancy(
    occupancy: Map<string, number>,
    startTime: string,
    count: number,
    settings: ScheduleSettings,
): string[] {
    const { emailsPerBatch, batchIntervalMinutes } = settings;
    const allowedPeriods = getAllowedPeriods(settings);
    let currentSlotMinutes = skipBlockedPeriods(timeToMinutes(startTime), allowedPeriods);
    const slots: string[] = [];
    const maxMinutes = 24 * 60;
    for (let i = 0; i < count; i++) {
        while (currentSlotMinutes < maxMinutes) {
            const slotTime = minutesToTime(currentSlotMinutes);
            const currentCount = occupancy.get(slotTime) || 0;
            if (currentCount < emailsPerBatch) {
                slots.push(slotTime);
                occupancy.set(slotTime, currentCount + 1);
                break;
            }
            currentSlotMinutes = skipBlockedPeriods(currentSlotMinutes + batchIntervalMinutes, allowedPeriods);
        }
    }
    return slots;
}
