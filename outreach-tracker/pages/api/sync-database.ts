import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { syncDailyStats } from '../../lib/daily-stats';
import { invalidateScheduleCache } from '../../lib/email-schedule';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';

interface NameMismatch {
    rowIndex: number;
    oldName: string;
    newName: string;
    id: string;
}

interface IdNameMismatch {
    rowIndex: number;
    trackerName: string;
    dbName: string;
    id: string;
}

interface IdMismatch {
    rowIndex: number;
    oldId: string;
    newId: string;
    name: string;
}

interface MissingInDatabase {
    id: string;
    name: string;
    rowIndex: number;
}

type NewCompanyRow = (string | number)[];

/** Retry a Google API call with exponential backoff for transient failures */
async function withRetry<T>(
    fn: () => Promise<T>,
    opts: { maxAttempts?: number; operationName?: string } = {}
): Promise<T> {
    const { maxAttempts = 3, operationName = 'operation' } = opts;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e as Error;
            const isRetryable =
                (lastError.message?.includes('RESOURCE_EXHAUSTED') ||
                    lastError.message?.includes('rateLimitExceeded') ||
                    (lastError as { code?: number }).code === 429) &&
                attempt < maxAttempts;
            if (isRetryable) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.warn(`[Sync] ${operationName} attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw lastError;
            }
        }
    }
    throw lastError || new Error('Unknown error');
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const session = await getServerSession(req, res, authOptions);
        if (!session?.user?.email) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const members = await getCommitteeMembers();
        const userEmail = session.user.email.toLowerCase().trim();
        const user = members.find(m => m.email?.toLowerCase().trim() === userEmail);
        const roleLower = user?.role?.toLowerCase() || '';
        if (!user || roleLower !== 'superadmin') {
            return res.status(403).json({ message: 'Superadmin access required' });
        }

        const { preview = false } = req.body;
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1; // Master Database (Source of Truth)
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;  // Outreach Tracker (Operational)

        if (!trackerSpreadsheetId) throw new Error('Tracker Spreadsheet ID not found');

        // 0. Pre-flight: Validate all required sheets exist in Tracker before any sync
        // Tracker sheet always follows Database IDs. Email_Schedule, Thread_History, Logs_DoNotEdit
        // must exist and be accessible for ID healing and audit trail.
        const validation = await validateTrackerSheets(sheets, trackerSpreadsheetId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: `Pre-flight validation failed: ${validation.errors.join('; ')}. Fix the Tracker spreadsheet before syncing.`,
            });
        }

        // 1. Ensure Required Sheets and Headers (creates missing sheets, adds headers if empty)
        if (!preview) {
            await ensureRequiredSheets(sheets, trackerSpreadsheetId);
        }

        console.log('Starting Database Sync...');

        // 2. Fetch Data
        // Database: Get ID (A) and Name (B)
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:B`,
        });
        const dbRows = dbResponse.data.values || [];

        // Tracker: Get ID (A) and Name (B)
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheet = trackerMetadata.data.sheets?.[0]; // Assume first sheet
        if (!trackerSheet) throw new Error('Tracker sheet not found');
        const trackerSheetName = trackerSheet.properties?.title;
        const trackerSheetId = trackerSheet.properties?.sheetId;

        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:O`,
        });
        const trackerRows = (trackerResponse.data.values || []) as string[][];

        // Normalize ID for case-insensitive matching (ME-0001 vs me-0001)
        const normalizeId = (id: string) => id?.toString().trim().toUpperCase() || '';

        // 2. Build Tracker map by ID only.
        // Company identity is keyed by ID; duplicate company names are allowed.
        const trackerEntriesById = new Map<string, Array<{ id: string; name: string; rowIndex: number }>>();

        trackerRows.forEach((row, index) => {
            const id = row[0]?.toString().trim();
            const name = row[1]?.toString().trim();
            const rowIndex = index + 2; // 1-based, +header

            if (id) {
                const key = normalizeId(id);
                if (!trackerEntriesById.has(key)) {
                    trackerEntriesById.set(key, []);
                }
                trackerEntriesById.get(key)!.push({ id, name: name || '', rowIndex });
            }
        });

        // Track which tracker rows have been "claimed" by a database entry
        const claimedRows = new Set<number>();

        const missingInTracker: NewCompanyRow[] = [];
        const nameMismatches: NameMismatch[] = [];
        const idNameMismatches: IdNameMismatch[] = []; // ID matched but name differs; no name match in tracker — flag for review to avoid name/status mismatch
        const idMismatches: IdMismatch[] = [];
        const duplicatesToRemove: number[] = []; // Rows to delete

        // 3. Process each Database company (one per unique ID; DB has multiple rows per company for contacts)
        const processedDbIds = new Set<string>();
        dbRows.forEach(row => {
            const dbId = row[0]?.toString().trim();
            const dbName = row[1]?.toString().trim();

            if (!dbId || !dbName) return;

            const dbIdKey = normalizeId(dbId);
            if (processedDbIds.has(dbIdKey)) return;
            processedDbIds.add(dbIdKey);

            // Look up by ID only. If the ID does not exist in Tracker, add a new default row.
            // Do not fall back to company name, because duplicate names with different IDs are valid.
            let rowByID: { rowIndex: number; id: string; name: string } | null = null;

            if (trackerEntriesById.has(dbIdKey)) {
                const entries = trackerEntriesById.get(dbIdKey)!;
                const entry = entries.find(e => !claimedRows.has(e.rowIndex)) || entries[0];
                rowByID = { rowIndex: entry.rowIndex, id: entry.id, name: entry.name };
            }

            let primaryRow: { rowIndex: number; currentId: string; currentName: string } | null = null;

            if (rowByID) {
                primaryRow = { rowIndex: rowByID.rowIndex, currentId: rowByID.id, currentName: rowByID.name };
                trackerEntriesById.get(dbIdKey)!.forEach(e => claimedRows.add(e.rowIndex));
            }

            if (primaryRow) {
                claimedRows.add(primaryRow.rowIndex);

                // When the ID matches, it is safe to align the tracker company name to the Database.
                if (primaryRow.currentName.trim() !== dbName) {
                    nameMismatches.push({
                        rowIndex: primaryRow.rowIndex,
                        oldName: primaryRow.currentName,
                        newName: dbName,
                        id: dbId
                    });
                }
            } else {
                // No existing row found - add new (15-column post-migration layout)
                missingInTracker.push([
                    dbId,             // A: Company ID
                    dbName,           // B: Company Name
                    'To Contact',     // C: Contact Status
                    '',               // D: Relationship Status
                    'Email',          // E: Channel
                    '0',              // F: Urgency Score
                    '',               // G: Previous Response
                    'Unassigned',     // H: Assigned PIC
                    '',               // I: Last Company Contact
                    '',               // J: Last Committee Contact
                    '0',              // K: Follow Ups Completed
                    '',               // L: Sponsorship Tier
                    '',               // M: Days Attending
                    '',               // N: Remarks
                    new Date().toISOString() // O: Last Update
                ]);
            }
        });

        // 3.1 Identify Bi-directional Sync (Missing in Database)
        const missingInDatabase: MissingInDatabase[] = [];
        trackerRows.forEach((row, index) => {
            const rowIndex = index + 2;
            if (!claimedRows.has(rowIndex)) {
                const id = row[0]?.toString().trim();
                const name = row[1]?.toString().trim();
                if (name) {
                    missingInDatabase.push({ id, name, rowIndex });
                }
            }
        });

        // 4. Execute Updates
        const stats = {
            added: 0,
            addedToDatabase: 0,
            updated: 0,
            duplicatesRemoved: 0,
            errors: [] as string[]
        };

        // Batch Append to Database (Bi-directional)
        if (missingInDatabase.length > 0) {
            if (!preview) {
                const valuesToAppend = missingInDatabase.map(m => [m.id, m.name]);
                await withRetry(
                    () =>
                        sheets.spreadsheets.values.append({
                            spreadsheetId: databaseSpreadsheetId,
                            range: `${dbSheetName}!A:B`,
                            valueInputOption: 'USER_ENTERED',
                            requestBody: { values: valuesToAppend }
                        }),
                    { operationName: 'append to database' }
                );
            }
            stats.addedToDatabase = missingInDatabase.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Added ${missingInDatabase.length} companies TO DATABASE.`);
        }

        // Batch Append (New Rows)
        if (missingInTracker.length > 0) {
            if (!preview) {
                await withRetry(
                    () =>
                        sheets.spreadsheets.values.append({
                            spreadsheetId: trackerSpreadsheetId,
                            range: `${trackerSheetName}!A:O`,
                            valueInputOption: 'USER_ENTERED',
                            requestBody: { values: missingInTracker }
                        }),
                    { operationName: 'append to tracker' }
                );
            }
            stats.added = missingInTracker.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Added ${missingInTracker.length} new companies.`);
        }

        // Batch Update (Name Fixes)
        // Skip name updates for rows that are also getting an ID change—that row may belong to another
        // company (swap); updating its name would overwrite the wrong company.
        const rowsWithIdChange = new Set(idMismatches.map((m: { rowIndex: number }) => m.rowIndex));
        const nameUpdatesToApply = nameMismatches.filter((m: { rowIndex: number }) => !rowsWithIdChange.has(m.rowIndex));
        if (nameUpdatesToApply.length > 0) {
            const requests = nameUpdatesToApply.map((item: { rowIndex: number; newName: string }) => ({
                updateCells: {
                    range: {
                        sheetId: trackerSheetId,
                        startRowIndex: item.rowIndex - 1, // 0-based
                        endRowIndex: item.rowIndex,
                        startColumnIndex: 1, // Column B (Name)
                        endColumnIndex: 2
                    },
                    rows: [{
                        values: [{
                            userEnteredValue: { stringValue: item.newName }
                        }]
                    }],
                    fields: 'userEnteredValue'
                }
            }));

            // Chunk requests to avoid payload limits (e.g., 100 at a time)
            const CHUNK_SIZE = 100;
            for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
                const chunk = requests.slice(i, i + CHUNK_SIZE);
                if (!preview) {
                    await withRetry(
                        () =>
                            sheets.spreadsheets.batchUpdate({
                                spreadsheetId: trackerSpreadsheetId,
                                requestBody: { requests: chunk }
                            }),
                        { operationName: `name fix batch ${i / CHUNK_SIZE + 1}` }
                    );
                }
            }
            stats.updated = nameUpdatesToApply.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Updated names for ${nameUpdatesToApply.length} companies.`);
        }

        // Batch Update (ID Fixes - Healing)
        // Write the full row with corrected ID so the entire row stays together (status, PIC, etc.)
        // Process higher numeric ID first when swapping to avoid temporary duplicates
        if (idMismatches.length > 0) {
            const parseIdNum = (id: string) => parseInt(id.match(/ME-(\d+)/i)?.[1] || '0', 10);
            const sortedIdMismatches = [...idMismatches].sort((a, b) => parseIdNum(b.newId) - parseIdNum(a.newId));

            const idUpdateData = sortedIdMismatches.map(item => {
                const row = trackerRows[item.rowIndex - 2] || [];
                const fullRow = [...row];
                fullRow[0] = item.newId;
                while (fullRow.length < 15) fullRow.push('');
                return {
                    range: `${trackerSheetName}!A${item.rowIndex}:O${item.rowIndex}`,
                    values: [fullRow.slice(0, 15)]
                };
            });

            if (!preview && idUpdateData.length > 0) {
                await withRetry(
                    () =>
                        sheets.spreadsheets.values.batchUpdate({
                            spreadsheetId: trackerSpreadsheetId,
                            requestBody: {
                                valueInputOption: 'RAW',
                                data: idUpdateData
                            }
                        }),
                    { operationName: 'ID fix batch' }
                );
            }
            stats.updated += idMismatches.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Updated IDs for ${idMismatches.length} companies (full row).`);

            // Update Email_Schedule so schedule entries stay linked to corrected IDs.
            // NOTE: Logs_DoNotEdit and Thread_History are NOT altered here so they remain
            // the immutable audit trail for audit-based ID recovery.
            if (!preview && idMismatches.length > 0) {
                try {
                    const idMap = new Map(idMismatches.map(m => [m.oldId, m.newId]));

                    // Update Email_Schedule column A (companyId) so schedule entries stay linked to corrected IDs
                    try {
                        const scheduleResponse = await sheets.spreadsheets.values.get({
                            spreadsheetId: trackerSpreadsheetId,
                            range: 'Email_Schedule!A2:A',
                        });
                        const scheduleRows = (scheduleResponse.data.values || []) as string[][];
                        if (scheduleRows.length > 0) {
                            const newScheduleIds = scheduleRows.map(row => {
                                const oldId = row[0] ? String(row[0]).trim() : '';
                                const newId = oldId && idMap.has(oldId) ? idMap.get(oldId)! : oldId;
                                return [newId];
                            });
                            const changedCount = newScheduleIds.filter((row, i) => {
                                const old = scheduleRows[i]?.[0]?.trim() || '';
                                return old && idMap.has(old);
                            }).length;
                            if (changedCount > 0) {
                                await sheets.spreadsheets.values.update({
                                    spreadsheetId: trackerSpreadsheetId,
                                    range: `Email_Schedule!A2:A${1 + newScheduleIds.length}`,
                                    valueInputOption: 'RAW',
                                    requestBody: { values: newScheduleIds },
                                });
                                invalidateScheduleCache();
                                console.log(`Updated ${changedCount} Email_Schedule company IDs during sync.`);
                            }
                        }
                    } catch (scheduleErr) {
                        console.warn('Email_Schedule update during sync ID fix failed (sheet may not exist):', scheduleErr);
                    }

                    // Audit trail in Logs_DoNotEdit and Thread_History
                    const actorName = user?.name || user?.email || session?.user?.email || 'Sync';
                    const now = new Date().toISOString();
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: trackerSpreadsheetId,
                        range: 'Logs_DoNotEdit!A:E',
                        valueInputOption: 'RAW',
                        requestBody: {
                            values: [[
                                now,
                                actorName,
                                'SYNC_ID_FIX',
                                `Updated ${idMismatches.length} company IDs during database sync`,
                                JSON.stringify(idMismatches.map(m => ({ oldId: m.oldId, newId: m.newId, name: m.name }))),
                            ]],
                        },
                    });
                    const threadRows = idMismatches.map(m => [now, m.newId, actorName, `ID healed: ${m.oldId} → ${m.newId} (${m.name})`]);
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: trackerSpreadsheetId,
                        range: 'Thread_History!A:D',
                        valueInputOption: 'RAW',
                        requestBody: { values: threadRows },
                    });
                } catch (err) {
                    console.warn('Email_Schedule or audit append during sync ID fix failed:', err);
                }
            }
        }

        // Batch Delete (Duplicate Rows)
        if (duplicatesToRemove.length > 0) {
            // Sort in reverse order to delete from bottom to top
            // This prevents row indices from shifting during deletion
            const sortedDuplicates = [...duplicatesToRemove].sort((a, b) => b - a);

            const deleteRequests = sortedDuplicates.map(rowIndex => ({
                deleteDimension: {
                    range: {
                        sheetId: trackerSheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1, // 0-based
                        endIndex: rowIndex // exclusive
                    }
                }
            }));

            // Delete in chunks
            const CHUNK_SIZE = 100;
            for (let i = 0; i < deleteRequests.length; i += CHUNK_SIZE) {
                const chunk = deleteRequests.slice(i, i + CHUNK_SIZE);
                if (!preview) {
                    await withRetry(
                        () =>
                            sheets.spreadsheets.batchUpdate({
                                spreadsheetId: trackerSpreadsheetId,
                                requestBody: { requests: chunk }
                            }),
                        { operationName: `delete duplicates batch ${i / CHUNK_SIZE + 1}` }
                    );
                }
            }
            stats.duplicatesRemoved = duplicatesToRemove.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Removed ${duplicatesToRemove.length} duplicate rows.`);
        }

        // 5. Invalidate Cache and sync daily stats
        if (!preview) {
            cache.delete('sheet_data');
            await syncDailyStats(sheets, trackerSpreadsheetId);
        }

        return res.status(200).json({
            success: true,
            preview,
            stats: { ...stats, idNameMismatchesCount: idNameMismatches.length },
            details: {
                added: missingInTracker.map(r => ({ id: r[0], name: r[1] })),
                nameCorrections: nameMismatches.map(m => ({ id: m.id, oldName: m.oldName, newName: m.newName })),
                idNameMismatches: idNameMismatches.map(m => ({ id: m.id, rowIndex: m.rowIndex, trackerName: m.trackerName, dbName: m.dbName })),
                idChanges: idMismatches.map(m => ({ name: m.name, oldId: m.oldId, newId: m.newId })),
                missingInDatabase: missingInDatabase.map(m => ({ id: m.id, name: m.name })),
                duplicatesRemoved: duplicatesToRemove.map(rowIndex => {
                    const row = trackerRows[rowIndex - 2];
                    return {
                        rowIndex,
                        id: row?.[0] || 'Unknown',
                        name: row?.[1] || 'Unknown'
                    };
                })
            }
        });

    } catch (error) {
        console.error('Sync Error:', error);
        return res.status(500).json({
            success: false,
            message: (error as Error).message || 'Internal Server Error'
        });
    }
}

/**
 * Pre-flight validation: Ensure all required sheets exist and are readable in the Tracker spreadsheet.
 * Tracker sheet always follows Database IDs. Email_Schedule, Thread_History, and Logs_DoNotEdit
 * must exist for ID healing and audit trail during sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateTrackerSheets(sheets: any, trackerSpreadsheetId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    try {
        const metadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const existingSheets = metadata.data.sheets || [];
        const sheetTitles = existingSheets.map((s: { properties?: { title?: string } }) => s.properties?.title || '');

        const mainSheetName = existingSheets[0]?.properties?.title;
        const requiredSheets = [
            { name: mainSheetName || 'Main Companies', key: 'main', range: `${mainSheetName}!A1:O1` },
            { name: 'Email_Schedule', key: 'Email_Schedule', range: 'Email_Schedule!A1:J1' },
            { name: 'Thread_History', key: 'Thread_History', range: 'Thread_History!A1:D1' },
            { name: 'Logs_DoNotEdit', key: 'Logs_DoNotEdit', range: 'Logs_DoNotEdit!A1:E1' },
        ];

        for (const req of requiredSheets) {
            if (!req.name) {
                errors.push('Main companies sheet not found');
                continue;
            }
            const found = sheetTitles.includes(req.name);
            if (!found) {
                errors.push(`Missing sheet: ${req.name}`);
                continue;
            }
            try {
                await sheets.spreadsheets.values.get({
                    spreadsheetId: trackerSpreadsheetId,
                    range: req.range,
                });
            } catch (readErr) {
                errors.push(`Cannot read sheet "${req.name}": ${(readErr as Error).message}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    } catch (err) {
        return {
            valid: false,
            errors: [`Failed to validate Tracker spreadsheet: ${(err as Error).message}`],
        };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureRequiredSheets(sheets: any, spreadsheetId: string) {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = metadata.data.sheets || [];

    // First sheet is considered the main "Companies" sheet, whatever its name is
    const mainSheetName = existingSheets[0]?.properties?.title || 'Companies';

    const requiredSheets = [
        {
            title: mainSheetName,
            headers: [
                'Company ID', 'Company Name', 'Contact Status', 'Relationship Status',
                'Channel', 'Urgency Score', 'Previous Response', 'Assigned PIC',
                'Last Company Contact', 'Last Committee Contact', 'Follow Ups Completed',
                'Sponsorship Tier', 'Days Attending', 'Remarks', 'Last Update'
            ]
        },
        {
            title: 'Email_Schedule',
            headers: ['Company ID', 'Company Name', 'PIC', 'Date', 'Time', 'Order', 'Created At', 'Created By', 'Note', 'Completed']
        },
        {
            title: 'Logs_DoNotEdit',
            headers: ['Timestamp', 'User', 'Action', 'Details', 'Data']
        },
        {
            title: 'Thread_History',
            headers: ['Date', 'Company ID', 'User', 'Remark']
        }
    ];

    for (const reqSheet of requiredSheets) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const foundSheet = existingSheets.find((s: any) => s.properties.title === reqSheet.title);

        if (!foundSheet) {
            // Create sheet
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: { title: reqSheet.title }
                        }
                    }]
                }
            });
            // Add headers
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${reqSheet.title}!A1`,
                valueInputOption: 'RAW',
                requestBody: { values: [reqSheet.headers] }
            });
        } else {
            // Check headers
            const headerResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${reqSheet.title}!A1:O1`,
            });
            const actualHeaders = headerResponse.data.values?.[0] || [];

            // Only overwrite if the sheet is completely empty (no headers)
            if (actualHeaders.length === 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${reqSheet.title}!A1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [reqSheet.headers] }
                });
            }
        }
    }
}
