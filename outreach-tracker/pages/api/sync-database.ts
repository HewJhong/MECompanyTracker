import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { syncDailyStats } from '../../lib/daily-stats';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { preview = false } = req.body;
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1; // Master Database (Source of Truth)
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;  // Outreach Tracker (Operational)

        if (!trackerSpreadsheetId) throw new Error('Tracker Spreadsheet ID not found');

        // 0. Ensure Required Sheets and Headers
        if (!preview) {
            await ensureRequiredSheets(sheets, trackerSpreadsheetId);
        }

        console.log('Starting Database Sync...');

        // 1. Fetch Data
        // Database: Get ID (A) and Name (B)
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        if (!dbSheet) throw new Error('Database sheet not found');
        const dbSheetName = dbSheet.properties?.title;

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

        // 2. Build Comprehensive Tracker Maps
        // Track ALL occurrences of each company (not just the last one)
        const trackerEntriesById = new Map<string, Array<{ id: string; name: string; rowIndex: number }>>();
        const trackerEntriesByName = new Map<string, Array<{ id: string; rowIndex: number }>>();

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

            if (name) {
                const normalizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
                if (!trackerEntriesByName.has(normalizedName)) {
                    trackerEntriesByName.set(normalizedName, []);
                }
                trackerEntriesByName.get(normalizedName)!.push({ id, rowIndex });
            }
        });

        // Track which tracker rows have been "claimed" by a database entry
        const claimedRows = new Set<number>();

        const missingInTracker: any[] = [];
        const nameMismatches: any[] = [];
        const idNameMismatches: any[] = []; // ID matched but name differs; no name match in tracker — flag for review to avoid name/status mismatch
        const idMismatches: any[] = [];
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

            const normalizedDbName = dbName.toLowerCase().replace(/\s+/g, ' ').trim();

            // Look up both by ID and by name
            let rowByID: { rowIndex: number; id: string; name: string } | null = null;
            let rowByName: { rowIndex: number; id: string } | null = null;

            if (trackerEntriesById.has(dbIdKey)) {
                const entries = trackerEntriesById.get(dbIdKey)!;
                const entry = entries.find(e => !claimedRows.has(e.rowIndex)) || entries[0];
                rowByID = { rowIndex: entry.rowIndex, id: entry.id, name: entry.name };
            }
            if (trackerEntriesByName.has(normalizedDbName)) {
                const entries = trackerEntriesByName.get(normalizedDbName)!;
                const entry = entries.find(e => !claimedRows.has(e.rowIndex)) || entries[0];
                rowByName = { rowIndex: entry.rowIndex, id: entry.id };
            }

            // Precedence: Name match wins when ID and name point to different rows (swap — status/remarks belong to the row with correct name).
            // - Swap: use name match (that row has correct name, needs ID fix only)
            // - Same row or ID-only: use ID match
            // - Name-only: use name match
            const isSwap =
                rowByID &&
                rowByName &&
                rowByID.rowIndex !== rowByName.rowIndex &&
                rowByID.name.toLowerCase().trim() !== dbName.toLowerCase().trim();

            let primaryRow: { rowIndex: number; currentId: string; currentName: string } | null = null;

            if (isSwap) {
                primaryRow = { rowIndex: rowByName!.rowIndex, currentId: rowByName!.id, currentName: dbName };
                claimedRows.add(primaryRow.rowIndex);
                claimedRows.add(rowByID!.rowIndex);
                trackerEntriesById.get(dbIdKey)!.forEach(e => claimedRows.add(e.rowIndex));
            } else if (rowByID) {
                primaryRow = { rowIndex: rowByID.rowIndex, currentId: rowByID.id, currentName: rowByID.name };
                trackerEntriesById.get(dbIdKey)!.forEach(e => claimedRows.add(e.rowIndex));
            } else if (rowByName) {
                primaryRow = { rowIndex: rowByName.rowIndex, currentId: rowByName.id, currentName: dbName };
            }

            if (primaryRow) {
                claimedRows.add(primaryRow.rowIndex);

                // Only update name when safe. When ID matched but no row has this company name in tracker,
                // don't auto-update — the status/remarks on that row may belong to a different company.
                if (!isSwap && primaryRow.currentName.trim() !== dbName) {
                    if (rowByName) {
                        nameMismatches.push({
                            rowIndex: primaryRow.rowIndex,
                            oldName: primaryRow.currentName,
                            newName: dbName,
                            id: dbId
                        });
                    } else {
                        idNameMismatches.push({
                            rowIndex: primaryRow.rowIndex,
                            trackerName: primaryRow.currentName,
                            dbName,
                            id: dbId
                        });
                    }
                }

                if (primaryRow.currentId !== dbId) {
                    idMismatches.push({
                        rowIndex: primaryRow.rowIndex,
                        oldId: primaryRow.currentId,
                        newId: dbId,
                        name: dbName
                    });
                }

                // Mark duplicates to remove (only when not a swap; swap case doesn't create duplicates)
                if (!isSwap && trackerEntriesByName.has(normalizedDbName)) {
                    trackerEntriesByName.get(normalizedDbName)!.forEach(entry => {
                        if (entry.rowIndex !== primaryRow!.rowIndex && !claimedRows.has(entry.rowIndex)) {
                            duplicatesToRemove.push(entry.rowIndex);
                            claimedRows.add(entry.rowIndex);
                        }
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
        const missingInDatabase: any[] = [];
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
                await sheets.spreadsheets.values.append({
                    spreadsheetId: databaseSpreadsheetId,
                    range: `${dbSheetName}!A:B`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: valuesToAppend
                    }
                });
            }
            stats.addedToDatabase = missingInDatabase.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Added ${missingInDatabase.length} companies TO DATABASE.`);
        }

        // Batch Append (New Rows)
        if (missingInTracker.length > 0) {
            if (!preview) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: trackerSpreadsheetId,
                    range: `${trackerSheetName}!A:O`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: missingInTracker
                    }
                });
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
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: trackerSpreadsheetId,
                        requestBody: { requests: chunk }
                    });
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
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: trackerSpreadsheetId,
                    valueInputOption: 'RAW',
                    requestBody: { data: idUpdateData }
                });
            }
            stats.updated += idMismatches.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Updated IDs for ${idMismatches.length} companies (full row).`);
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
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: trackerSpreadsheetId,
                        requestBody: { requests: chunk }
                    });
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
