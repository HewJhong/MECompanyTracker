export interface BlockedPeriod {
    label: string;
    start: string; // HH:mm
    end: string;   // HH:mm
}

export interface ScheduleSettings {
    emailsPerBatch: number;
    batchIntervalMinutes: number;
    blockedPeriods: BlockedPeriod[];
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
    blockedPeriods: [
        { label: 'Lunch', start: '12:00', end: '13:00' },
        { label: 'After Hours', start: '16:00', end: '23:59' },
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

export function isInBlockedPeriod(minutes: number, blockedPeriods: BlockedPeriod[]): boolean {
    return blockedPeriods.some(p => {
        const start = timeToMinutes(p.start);
        const end = timeToMinutes(p.end);
        return minutes >= start && minutes < end;
    });
}

export function skipBlockedPeriods(minutes: number, blockedPeriods: BlockedPeriod[]): number {
    let current = minutes;
    let changed = true;
    // Iteratively advance past any blocked period — handles nested/adjacent blocks
    while (changed) {
        changed = false;
        for (const period of blockedPeriods) {
            const start = timeToMinutes(period.start);
            const end = timeToMinutes(period.end);
            if (current >= start && current < end) {
                current = end;
                changed = true;
            }
        }
    }
    return current;
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
    blockedPeriods: BlockedPeriod[],
    emailsPerBatch = 3,
    batchIntervalMinutes = 15,
): string[] {
    if (count <= 0) return [];

    const startMinutes = skipBlockedPeriods(timeToMinutes(startTime), blockedPeriods);

    const slots: string[] = [];
    let currentBatchStartMinutes = startMinutes;
    let countInCurrentBatch = 0;

    for (let i = 0; i < count; i++) {
        if (countInCurrentBatch >= emailsPerBatch) {
            const nextRaw = currentBatchStartMinutes + batchIntervalMinutes;
            currentBatchStartMinutes = skipBlockedPeriods(nextRaw, blockedPeriods);
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
    blockedPeriods: BlockedPeriod[],
): Warning[] {
    const warnings: Warning[] = [];
    const seenPeriods = new Set<string>();

    for (const slot of timeSlots) {
        const slotMinutes = timeToMinutes(slot);

        if (slotMinutes >= 24 * 60) {
            if (!seenPeriods.has('overflow')) {
                warnings.push({
                    type: 'blocked_period',
                    message: 'Some emails would be scheduled past midnight.',
                    time: slot,
                });
                seenPeriods.add('overflow');
            }
        }

        for (const period of blockedPeriods) {
            const key = period.label;
            if (!seenPeriods.has(key)) {
                const start = timeToMinutes(period.start);
                const end = timeToMinutes(period.end);
                if (slotMinutes >= start && slotMinutes < end) {
                    warnings.push({
                        type: 'blocked_period',
                        message: `Some emails fall within the "${period.label}" blocked period (${period.start}–${period.end}).`,
                        time: slot,
                    });
                    seenPeriods.add(key);
                }
            }
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
    const { defaultStartTime, batchIntervalMinutes, blockedPeriods } = settings;
    const startMinutes = skipBlockedPeriods(timeToMinutes(defaultStartTime), blockedPeriods);
    let endMinutes = timeToMinutes('18:00');
    if (entries && entries.length > 0) {
        const maxEntry = Math.max(...entries.map(e => timeToMinutes(normalizeTime(e.time))));
        endMinutes = Math.min(24 * 60, skipBlockedPeriods(maxEntry + batchIntervalMinutes, blockedPeriods));
    }
    const slots: VisibleSlot[] = [];
    let current = startMinutes;
    const maxMinutes = 24 * 60;
    while (current < maxMinutes && current <= endMinutes) {
        const time = minutesToTime(current);
        slots.push({
            time,
            blocked: isInBlockedPeriod(current, blockedPeriods),
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
    const { blockedPeriods, emailsPerBatch, batchIntervalMinutes } = settings;
    let currentSlotMinutes = skipBlockedPeriods(timeToMinutes(startTime), blockedPeriods);
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
            currentSlotMinutes = skipBlockedPeriods(currentSlotMinutes + batchIntervalMinutes, blockedPeriods);
        }
    }
    return slots;
}
