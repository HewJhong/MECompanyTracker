import { getGoogleSheetsClient } from './google-sheets';
import { cache, deleteCacheKeysAndPrefix } from './cache';
import {
    calculateTimeSlots,
    ScheduleSettings,
    DEFAULT_SCHEDULE_SETTINGS,
    timeToMinutes,
    minutesToTime,
    isInBlockedPeriod,
    skipBlockedPeriods,
    AllowedPeriod,
} from './schedule-calculator';

const SCHEDULE_SHEET = 'Email_Schedule';
const SETTINGS_SHEET = 'Email_Schedule_Settings';
const CACHE_KEY_SCHEDULE = 'email_schedule';
const CACHE_KEY_SETTINGS = 'email_schedule_settings';

function parsePositiveIntOrFallback(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isValidTimeString(value: string | undefined): value is string {
    const str = String(value ?? '').trim();
    if (!str) return false;
    const m = /^(\d{1,2}):(\d{2})$/.exec(str);
    if (!m) return false;
    const h = Number.parseInt(m[1], 10);
    const mm = Number.parseInt(m[2], 10);
    return Number.isFinite(h) && Number.isFinite(mm) && h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}

function normalizeAllowedPeriods(value: string | undefined): AllowedPeriod[] {
    if (!value) return [...DEFAULT_SCHEDULE_SETTINGS.allowedPeriods];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [...DEFAULT_SCHEDULE_SETTINGS.allowedPeriods];
        const normalized = parsed
            .map((p: unknown) => {
                if (!p || typeof p !== 'object') return null;
                const candidate = p as Record<string, unknown>;
                const label = String(candidate.label ?? '').trim();
                const start = String(candidate.start ?? '').trim();
                const end = String(candidate.end ?? '').trim();
                if (!label || !isValidTimeString(start) || !isValidTimeString(end)) return null;
                return { label, start, end };
            })
            .filter((p): p is AllowedPeriod => p !== null);
        return normalized.length > 0 ? normalized : [...DEFAULT_SCHEDULE_SETTINGS.allowedPeriods];
    } catch {
        return [...DEFAULT_SCHEDULE_SETTINGS.allowedPeriods];
    }
}

export interface EmailScheduleEntry {
    companyId: string;
    companyName: string;
    pic: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:mm
    order: number;
    createdAt?: string;
    createdBy?: string;
    note?: string;      // Optional follow-up purpose / context (col I)
    completed?: string; // 'Y' when outreach has been sent, blank otherwise (col J)
}

function getSpreadsheetId(): string {
    const id = process.env.SPREADSHEET_ID_2 || process.env.SPREADSHEET_ID_1 || process.env.SPREADSHEET_ID;
    if (!id) throw new Error('No SPREADSHEET_ID configured');
    return id;
}

/** Canonical "HH:mm" so "8:00" and "08:00" match. */
function normalizeTime(time: string): string {
    return minutesToTime(timeToMinutes(time));
}

/** Canonical YYYY-MM-DD for date comparison (sheet may store "3/10/2025" or "2025-03-10"). */
function normalizeDate(dateStr: string): string {
    if (!dateStr || !dateStr.trim()) return '';
    const d = new Date(dateStr.trim());
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toISOString().slice(0, 10);
}

/**
 * Match sheet rows to entries by slot, not by company+date alone.
 * Using only companyId|date caused multiple same-day slots to overwrite one row and mix up IDs vs names.
 */
function scheduleEntryRowKey(entry: EmailScheduleEntry): string {
    const order = Number.isFinite(entry.order) ? Math.trunc(entry.order) : 0;
    const timeRaw = String(entry.time ?? '').trim();
    const timeKey = timeRaw ? normalizeTime(timeRaw) : '00:00';
    return `${String(entry.companyId).trim()}|${normalizeDate(entry.date)}|${timeKey}|${order}`;
}

function scheduleRowKeyFromValues(row: string[]): string | null {
    if (!row[0]?.trim() || !row[3]?.trim()) return null;
    const orderRaw = parseInt(String(row[5] ?? '0'), 10);
    const order = Number.isNaN(orderRaw) ? 0 : orderRaw;
    const timeRaw = String(row[4] ?? '').trim();
    const timeKey = timeRaw ? normalizeTime(timeRaw) : '00:00';
    return `${String(row[0]).trim()}|${normalizeDate(String(row[3]).trim())}|${timeKey}|${order}`;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getEmailSchedule(date?: string): Promise<EmailScheduleEntry[]> {
    const cacheKey = date ? `${CACHE_KEY_SCHEDULE}_${date}` : CACHE_KEY_SCHEDULE;
    const cached = cache.get(cacheKey) as EmailScheduleEntry[] | undefined;
    if (cached) return cached;

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = getSpreadsheetId();

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${SCHEDULE_SHEET}!A2:J`,
        });

        const rows = response.data.values || [];
        let entries: EmailScheduleEntry[] = rows
            .filter(row => row[0])
            .map(row => ({
                companyId: String(row[0] || '').trim(),
                companyName: String(row[1] || '').trim(),
                pic: String(row[2] || '').trim(),
                date: String(row[3] || '').trim(),
                time: String(row[4] || '').trim(),
                order: parseInt(row[5] || '0', 10),
                createdAt: String(row[6] || '').trim(),
                createdBy: String(row[7] || '').trim(),
                note: String(row[8] || '').trim() || undefined,
                completed: String(row[9] || '').trim() || undefined,
            }));

        if (date) {
            const norm = normalizeDate(date);
            entries = entries.filter(e => normalizeDate(e.date) === norm);
        }

        // Sort by date, then time, then order
        entries.sort((a, b) => {
            const dateCmp = a.date.localeCompare(b.date);
            if (dateCmp !== 0) return dateCmp;
            const timeCmp = a.time.localeCompare(b.time);
            if (timeCmp !== 0) return timeCmp;
            return a.order - b.order;
        });

        cache.set(cacheKey, entries);
        return entries;
    } catch (error) {
        console.warn(`${SCHEDULE_SHEET} sheet not found or empty:`, error);
        return [];
    }
}

export async function getEmailScheduleSettings(): Promise<ScheduleSettings> {
    const cached = cache.get(CACHE_KEY_SETTINGS) as ScheduleSettings | undefined;
    if (cached) return cached;

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = getSpreadsheetId();

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${SETTINGS_SHEET}!A2:B`,
        });

        const rows = response.data.values || [];
        const settingsMap: Record<string, string> = {};
        rows.forEach(row => {
            if (row[0]) settingsMap[String(row[0]).trim()] = String(row[1] || '').trim();
        });

        const settings: ScheduleSettings = {
            emailsPerBatch: parsePositiveIntOrFallback(
                settingsMap.emailsPerBatch,
                DEFAULT_SCHEDULE_SETTINGS.emailsPerBatch,
            ),
            batchIntervalMinutes: parsePositiveIntOrFallback(
                settingsMap.batchIntervalMinutes,
                DEFAULT_SCHEDULE_SETTINGS.batchIntervalMinutes,
            ),
            defaultStartTime: isValidTimeString(settingsMap.defaultStartTime)
                ? settingsMap.defaultStartTime.trim()
                : DEFAULT_SCHEDULE_SETTINGS.defaultStartTime,
            allowedPeriods: normalizeAllowedPeriods(
                settingsMap.allowedPeriods || settingsMap.blockedPeriods, // legacy fallback
            ),
        };

        cache.set(CACHE_KEY_SETTINGS, settings);
        return settings;
    } catch {
        return { ...DEFAULT_SCHEDULE_SETTINGS };
    }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function saveEmailScheduleEntries(
    entries: EmailScheduleEntry[],
): Promise<void> {
    if (entries.length === 0) return;

    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // Read existing entries to determine which rows to update vs. append
    let existingRows: string[][] = [];
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${SCHEDULE_SHEET}!A2:J`,
        });
        existingRows = (response.data.values || []) as string[][];
    } catch {
        // Sheet may not exist yet — append will create it
    }

    // Map logical slot → sheet row (1-based, includes header offset)
    const rowIndexMap = new Map<string, number>();
    existingRows.forEach((row, i) => {
        const key = scheduleRowKeyFromValues(row);
        if (key) rowIndexMap.set(key, i + 2); // +2: 1-based + header row
    });

    const updates: { range: string; values: string[][] }[] = [];
    const appends: string[][] = [];

    for (const entry of entries) {
        const key = scheduleEntryRowKey(entry);
        const rowNum = rowIndexMap.get(key);
        const rowValues = [
            entry.companyId,
            entry.companyName,
            entry.pic,
            entry.date,
            entry.time,
            String(entry.order),
            entry.createdAt || new Date().toISOString(),
            entry.createdBy || '',
            entry.note ?? '',
            entry.completed ?? '',
        ];

        if (rowNum !== undefined) {
            updates.push({ range: `${SCHEDULE_SHEET}!A${rowNum}:J${rowNum}`, values: [rowValues] });
        } else {
            appends.push(rowValues);
        }
    }

    if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: updates,
            },
        });
    }

    if (appends.length > 0) {
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${SCHEDULE_SHEET}!A:J`,
            valueInputOption: 'RAW',
            requestBody: { values: appends },
        });
    }

    invalidateScheduleCache();
}

export async function saveEmailScheduleSettings(settings: ScheduleSettings): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const rows = [
        ['emailsPerBatch', String(settings.emailsPerBatch)],
        ['batchIntervalMinutes', String(settings.batchIntervalMinutes)],
        ['defaultStartTime', settings.defaultStartTime],
        ['allowedPeriods', JSON.stringify(settings.allowedPeriods)],
    ];

    // Overwrite entire settings sheet (clear then write)
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${SETTINGS_SHEET}!A2:B`,
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SETTINGS_SHEET}!A2:B${rows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
    });

    cache.delete(CACHE_KEY_SETTINGS);
}

export async function deleteEmailScheduleEntries(
    companyIds: string[],
    date: string,
): Promise<void> {
    if (companyIds.length === 0) return;

    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SCHEDULE_SHEET}!A2:J`,
    });

    const rows = (response.data.values || []) as string[][];
    const idsToDelete = new Set(companyIds);

    // Find row indices to blank out (Google Sheets doesn't support row deletion via Values API)
    const clearRequests: string[] = [];
    rows.forEach((row, i) => {
        if (row[0] && idsToDelete.has(row[0]) && row[3] === date) {
            clearRequests.push(`${SCHEDULE_SHEET}!A${i + 2}:J${i + 2}`);
        }
    });

    if (clearRequests.length > 0) {
        await sheets.spreadsheets.values.batchClear({
            spreadsheetId,
            requestBody: { ranges: clearRequests },
        });
    }

    invalidateScheduleCache();
}

/**
 * Remove all schedule entries for the given company IDs (any date).
 * Use when a scheduled email has been sent (e.g. first outreach or follow-up logged)
 * so the slot is freed and the company can be scheduled again for the next round.
 */
export async function deleteEmailScheduleEntriesForCompanies(
    companyIds: string[],
): Promise<void> {
    if (companyIds.length === 0) return;

    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SCHEDULE_SHEET}!A2:J`,
    });

    const rows = (response.data.values || []) as string[][];
    const idsToDelete = new Set(companyIds.map(id => String(id).trim()));

    const clearRequests: string[] = [];
    rows.forEach((row, i) => {
        const companyId = row[0] ? String(row[0]).trim() : '';
        if (companyId && idsToDelete.has(companyId)) {
            clearRequests.push(`${SCHEDULE_SHEET}!A${i + 2}:J${i + 2}`);
        }
    });

    if (clearRequests.length > 0) {
        await sheets.spreadsheets.values.batchClear({
            spreadsheetId,
            requestBody: { ranges: clearRequests },
        });
    }

    invalidateScheduleCache();
}

// ─── Business Logic ──────────────────────────────────────────────────────────

function getSlotOccupancy(entries: EmailScheduleEntry[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const e of entries) {
        const t = normalizeTime(e.time);
        map.set(t, (map.get(t) || 0) + 1);
    }
    return map;
}

/**
 * Computes time slots for a new batch so that each 15-min slot has at most
 * emailsPerBatch (e.g. 3) emails total, including existing entries on that date.
 * Fills partial slots first, then advances to the next slot.
 */
export async function computeTimeSlotsWithExisting(
    date: string,
    startTime: string,
    count: number,
): Promise<{ slots: string[]; endTime: string | null; settings: ScheduleSettings }> {
    const [settings, existingEntries] = await Promise.all([
        getEmailScheduleSettings(),
        getEmailSchedule(date),
    ]);

    const occupancy = getSlotOccupancy(existingEntries);
    const { allowedPeriods, emailsPerBatch, batchIntervalMinutes } = settings;

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

    const endTime = slots.length > 0 ? slots[slots.length - 1] : null;
    return { slots, endTime, settings };
}

/**
 * Given a start time and count, computes the time slot for each email
 * using the current settings (rate limits and allowed periods).
 * Use computeTimeSlotsWithExisting when adding to a date that may have existing entries.
 */
export async function computeTimeSlots(
    startTime: string,
    count: number,
): Promise<{ slots: string[]; endTime: string | null; settings: ScheduleSettings }> {
    const settings = await getEmailScheduleSettings();
    const slots = calculateTimeSlots(
        startTime,
        count,
        settings.allowedPeriods,
        settings.emailsPerBatch,
        settings.batchIntervalMinutes,
    );
    const endTime = slots.length > 0 ? slots[slots.length - 1] : null;
    return { slots, endTime, settings };
}

/**
 * Returns the earliest slot on the given date that has room for at least one more
 * email (i.e. fewer than emailsPerBatch already scheduled). Respects allowed periods.
 */
export async function getNextAvailableStartTime(date: string): Promise<string> {
    const [settings, existingEntries] = await Promise.all([
        getEmailScheduleSettings(),
        getEmailSchedule(date),
    ]);

    const occupancy = getSlotOccupancy(existingEntries);
    const { allowedPeriods, emailsPerBatch, batchIntervalMinutes, defaultStartTime } = settings;

    let slotMinutes = skipBlockedPeriods(timeToMinutes(defaultStartTime), allowedPeriods);
    const maxMinutes = 24 * 60;

    while (slotMinutes < maxMinutes) {
        const slotTime = minutesToTime(slotMinutes);
        if ((occupancy.get(slotTime) || 0) < emailsPerBatch) {
            return slotTime;
        }
        slotMinutes = skipBlockedPeriods(slotMinutes + batchIntervalMinutes, allowedPeriods);
    }

    return minutesToTime(slotMinutes);
}

/**
 * Validates a proposed schedule against existing entries and allowed periods.
 */
export async function checkTimeConflicts(
    date: string,
    startTime: string,
    count: number,
): Promise<{ valid: boolean; warnings: string[]; conflictingEntries: EmailScheduleEntry[] }> {
    const [settings, existingEntries] = await Promise.all([
        getEmailScheduleSettings(),
        getEmailSchedule(date),
    ]);

    const proposedSlots = calculateTimeSlots(
        startTime,
        count,
        settings.allowedPeriods,
        settings.emailsPerBatch,
        settings.batchIntervalMinutes,
    );

    const warnings: string[] = [];
    const conflictingEntries: EmailScheduleEntry[] = [];

    // Check allowed period violations in proposed slots
    const proposedMinutesSet = new Set(proposedSlots.map(timeToMinutes));

    for (const slot of proposedSlots) {
        const slotMinutes = timeToMinutes(slot);
        if (isInBlockedPeriod(slotMinutes, settings.allowedPeriods)) {
            warnings.push(`Slot at ${slot} falls outside configured allowed sending periods.`);
        }
    }

    // Check conflicts with existing entries (same time slots already used)
    const existingMinutesSet = new Set(existingEntries.map(e => timeToMinutes(e.time)));
    for (const slotMinutes of proposedMinutesSet) {
        if (existingMinutesSet.has(slotMinutes)) {
            const conflicting = existingEntries.filter(e => timeToMinutes(e.time) === slotMinutes);
            conflictingEntries.push(...conflicting);
        }
    }

    const hasBlockedPeriodConflict = warnings.some(w => w.includes('outside allowed period'));
    const hasConflicts = conflictingEntries.length > 0;

    return {
        valid: !hasBlockedPeriodConflict && !hasConflicts,
        warnings,
        conflictingEntries,
    };
}

export function invalidateScheduleCache(): void {
    // Clear all schedule-related cache keys (including date-prefixed email_schedule_YYYY-MM-DD)
    deleteCacheKeysAndPrefix([CACHE_KEY_SCHEDULE, CACHE_KEY_SETTINGS], CACHE_KEY_SCHEDULE);
}
