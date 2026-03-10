import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

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
            range: `${trackerSheetName}!A2:B`,
        });
        const trackerRows = trackerResponse.data.values || [];

        // 2. Build Comprehensive Tracker Maps
        // Track ALL occurrences of each company (not just the last one)
        const trackerEntriesById = new Map<string, Array<{ name: string; rowIndex: number }>>();
        const trackerEntriesByName = new Map<string, Array<{ id: string; rowIndex: number }>>();

        trackerRows.forEach((row, index) => {
            const id = row[0]?.toString().trim();
            const name = row[1]?.toString().trim();
            const rowIndex = index + 2; // 1-based, +header

            if (id) {
                if (!trackerEntriesById.has(id)) {
                    trackerEntriesById.set(id, []);
                }
                trackerEntriesById.get(id)!.push({ name, rowIndex });
            }

            if (name) {
                const normalizedName = name.toLowerCase().replace(/\\s+/g, ' ').trim();
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
        const idMismatches: any[] = [];
        const duplicatesToRemove: number[] = []; // Rows to delete

        // 3. Process each Database company
        dbRows.forEach(row => {
            const dbId = row[0]?.toString().trim();
            const dbName = row[1]?.toString().trim();

            if (!dbId || !dbName) return;

            const normalizedDbName = dbName.toLowerCase().replace(/\\s+/g, ' ').trim();

            // Strategy: Find the "primary" row in tracker for this company
            let primaryRow: { rowIndex: number; currentId: string; currentName: string } | null = null;

            // Priority 1: Exact ID match
            if (trackerEntriesById.has(dbId)) {
                const entries = trackerEntriesById.get(dbId)!;
                // Pick the first unclaimed entry (or first overall)
                const entry = entries.find(e => !claimedRows.has(e.rowIndex)) || entries[0];
                primaryRow = { rowIndex: entry.rowIndex, currentId: dbId, currentName: entry.name };
            }

            // Priority 2: Name match (ID healing case)
            if (!primaryRow && trackerEntriesByName.has(normalizedDbName)) {
                const entries = trackerEntriesByName.get(normalizedDbName)!;
                const entry = entries.find(e => !claimedRows.has(e.rowIndex)) || entries[0];
                primaryRow = { rowIndex: entry.rowIndex, currentId: entry.id, currentName: dbName };
            }

            if (primaryRow) {
                // Found existing row - claim it
                claimedRows.add(primaryRow.rowIndex);

                // Check if name needs updating
                if (primaryRow.currentName.trim() !== dbName) {
                    nameMismatches.push({
                        rowIndex: primaryRow.rowIndex,
                        oldName: primaryRow.currentName,
                        newName: dbName,
                        id: dbId
                    });
                }

                // Check if ID needs healing
                if (primaryRow.currentId !== dbId) {
                    idMismatches.push({
                        rowIndex: primaryRow.rowIndex,
                        oldId: primaryRow.currentId,
                        newId: dbId,
                        name: dbName
                    });
                }

                // Mark any other rows with same name as duplicates to remove
                if (trackerEntriesByName.has(normalizedDbName)) {
                    trackerEntriesByName.get(normalizedDbName)!.forEach(entry => {
                        if (entry.rowIndex !== primaryRow!.rowIndex && !claimedRows.has(entry.rowIndex)) {
                            duplicatesToRemove.push(entry.rowIndex);
                            claimedRows.add(entry.rowIndex);
                        }
                    });
                }
            } else {
                // No existing row found - add new
                missingInTracker.push([
                    dbId,             // A: ID
                    dbName,           // B: Name
                    'To Contact',     // C: Status
                    'Email',          // D: Channel
                    '0',              // E: Urgency
                    '',               // F: Prev Response
                    'Unassigned',     // G: PIC
                    '',               // H: Last Company Contact Date
                    '',               // I: Last Committee Contact Date
                    '0',              // J: Follow-ups
                    '',               // K: Sponsorship Tier
                    '',               // L: Remarks
                    new Date().toISOString() // M: Last Update
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
                    range: `${trackerSheetName}!A:M`,
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
        if (nameMismatches.length > 0) {
            const requests = nameMismatches.map(item => ({
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
            stats.updated = nameMismatches.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Updated names for ${nameMismatches.length} companies.`);
        }

        // Batch Update (ID Fixes - Healing)
        if (idMismatches.length > 0) {
            const requests = idMismatches.map(item => ({
                updateCells: {
                    range: {
                        sheetId: trackerSheetId,
                        startRowIndex: item.rowIndex - 1, // 0-based
                        endRowIndex: item.rowIndex,
                        startColumnIndex: 0, // Column A (ID)
                        endColumnIndex: 1
                    },
                    rows: [{
                        values: [{
                            userEnteredValue: { stringValue: item.newId }
                        }]
                    }],
                    fields: 'userEnteredValue'
                }
            }));

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
            stats.updated += idMismatches.length;
            console.log(`${preview ? '[PREVIEW] ' : ''}Updated IDs for ${idMismatches.length} companies.`);
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

        // 5. Invalidate Cache
        if (!preview) {
            cache.delete('sheet_data');
        }

        return res.status(200).json({
            success: true,
            preview,
            stats,
            details: {
                added: missingInTracker.map(r => ({ id: r[0], name: r[1] })),
                nameCorrections: nameMismatches.map(m => ({ id: m.id, oldName: m.oldName, newName: m.newName })),
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
                'ID', 'Name', 'Status', 'Channel', 'Urgency',
                'Prev Response', 'PIC', 'Last Company Contact Date',
                'Last Committee Contact Date', 'Follow-ups',
                'Sponsorship Tier', 'Remarks', 'Last Update'
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
                range: `${reqSheet.title}!A1:M1`,
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
