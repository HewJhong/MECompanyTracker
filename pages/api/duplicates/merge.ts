import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { cache } from '../../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { keepId, mergeId, strategy } = req.body;

    if (!keepId || !mergeId || !strategy) {
        return res.status(400).json({ message: 'Missing required parameters' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;

        // 1. Fetch Tracker Data
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheet = trackerMetadata.data.sheets?.[0];
        const trackerSheetName = trackerSheet?.properties?.title;
        const trackerSheetId = trackerSheet?.properties?.sheetId;

        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A:A`,
        });
        const trackerIds = trackerResponse.data.values?.map(row => row[0]) || [];

        const keepRowIndex = trackerIds.indexOf(keepId);
        const mergeRowIndex = trackerIds.indexOf(mergeId);

        if (keepRowIndex === -1 || mergeRowIndex === -1) {
            throw new Error('One or both companies not found in Tracker');
        }

        const mergeRowNumber = mergeRowIndex + 1; // 1-based

        // 2. Identify All ID Changes (Healing + Shifting)
        // We'll map Old ID -> New ID
        const idChanges = new Map<string, string>();

        // A. The direct merge: victim -> survivor
        idChanges.set(mergeId, keepId);

        // B. The shift: every company BELOW the deleted row shifts UP and gets a new ID
        // ID Scheme: Row 1 = Header, Row 2 = ME-0001, Row 3 = ME-0002, etc.
        // Formula: Company ID = ME-{rowNumber - 1}
        // 
        // Example: If we delete row 50 (ME-0049):
        //   - Row 51 (ME-0050) becomes row 50 → new ID = ME-0049
        //   - Row 52 (ME-0051) becomes row 51 → new ID = ME-0050
        // 
        // trackerIds is 0-indexed array: trackerIds[0] = row 1 (header), trackerIds[1] = row 2 (ME-0001)
        // For element at index i:
        //   - Current row number = i + 1
        //   - After deletion of row at mergeRowIndex: new row number = i + 1 - 1 = i
        //   - New ID = ME-{newRowNumber - 1} = ME-{i - 1}

        const shiftedCompanies: { oldId: string; newId: string; newRowIndex: number }[] = [];

        for (let i = mergeRowIndex + 1; i < trackerIds.length; i++) {
            const oldId = trackerIds[i];
            if (!oldId) continue;

            // After deletion, this row shifts from position (i+1) to position i
            const newRowNumber = i; // 1-based row number after shift
            const newIdNumeric = newRowNumber - 1; // Row 2 → ME-0001, so ID = rowNumber - 1
            const newId = `ME-${newIdNumeric.toString().padStart(4, '0')}`;

            // newRowIndex for later updates (0-based array index after deletion)
            const newRowIndex = i - 1;

            if (oldId !== newId) {
                idChanges.set(oldId, newId);
                shiftedCompanies.push({ oldId, newId, newRowIndex });
            }
        }

        // 3. Update Database (Propagate ID changes to Contacts AND Handle deletions)
        // This is complex:
        // A. Contacts to Keep from Victim -> Move to Survivor ID
        // B. Contacts to Keep from Survivor -> (Already has Survivor ID, but if Survivor ID changed due to shift? No, Survivor is above Victim, so its ID is stable relative to shift?
        // Wait, if Survivor is BELOW Victim, Survivor's ID shifts!
        // So we must handle ID updates for ALL contacts of both companies + shifted companies.

        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const dbSheetName = dbSheet?.properties?.title;
        const dbSheetId = dbSheet?.properties?.sheetId;

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A:A`,
        });
        const dbIds = dbResponse.data.values?.map(row => row[0]) || [];

        const requestBody: any[] = [];

        // Rows to delete (indices)
        const rowsToDelete: number[] = [];

        // Identify keys for all contacts belonging to the MERGE group (Survivor + Victim)
        // We need to know which rows correspond to contacts of these companies.
        const keepContactIdsSet = new Set(req.body.keepContactIds || []);

        dbIds.forEach((id, index) => {
            const rowNumber = index + 1; // 1-based row number
            const contactUniqueId = `contact-${id}-${index}`; // Valid for this scan provided index hasn't changed. 
            // Better: We assume `scan.ts` logic `contact-${companyId}-${index}` generated unique IDs.
            // But wait, `index` in scan.ts was based on THAT scan. 
            // If DB didn't change, indices match.
            // If we use generated IDs from frontend, they look like `contact-ME-0012-45`.

            // Re-matching logic:
            // We have `keepContactIds` from frontend.
            // We iterate DB rows. if `id` matches `keepId` or `mergeId`:
            // It is a candidate.
            // Check if this row's constructed ID is in `keepContactIds`.

            if (id === keepId || id === mergeId) {
                const currentContactId = `contact-${id}-${index}`;

                if (keepContactIdsSet.has(currentContactId)) {
                    // KEEP this contact.
                    // Ensure it points to `keepId` (or `newId` if `keepId` shifted? No, `keepId` row is < `mergeId` row usually?
                    // If `keepId` is strictly `survivorId`, and we are establishing that `survivorId` is the final ID.
                    // BUT: if `survivorId` ITSELF shifts (e.g. merge Row 5 into Row 10. Row 5 deletes. Row 10 becomes Row 9. New ID!).
                    // `idChanges` map handles this!
                    // So we update it to `idChanges.get(keepId) || keepId`.

                    const finalId = idChanges.get(keepId) || keepId;
                    // Only update if it's different from current 'id' (which might be mergeId or keepId)
                    if (id !== finalId) {
                        requestBody.push({
                            updateCells: {
                                range: {
                                    sheetId: dbSheetId,
                                    startRowIndex: index,
                                    endRowIndex: index + 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 1
                                },
                                rows: [{ values: [{ userEnteredValue: { stringValue: finalId } }] }],
                                fields: 'userEnteredValue'
                            }
                        });
                    }
                } else {
                    // DISCARD this contact -> Delete Row
                    rowsToDelete.push(index);
                }
            } else if (idChanges.has(id)) {
                // Determine new ID for shifted companies
                const finalId = idChanges.get(id);
                if (finalId) {
                    requestBody.push({
                        updateCells: {
                            range: {
                                sheetId: dbSheetId,
                                startRowIndex: index,
                                endRowIndex: index + 1,
                                startColumnIndex: 0,
                                endColumnIndex: 1
                            },
                            rows: [{ values: [{ userEnteredValue: { stringValue: finalId } }] }],
                            fields: 'userEnteredValue'
                        }
                    });
                }
            }
        });

        // Add Deletions (Must specific descending order or process thoughtfully)
        // `deleteDimension` shifts rows up. If we delete row 10, row 11 becomes 10.
        // It's safest to sort descending and delete one by one? 
        // Or can we pass multiple ranges? 
        // Google API `deleteDimension` takes ONE range.
        // We can batch multiple `deleteDimension` requests, BUT we MUST account for shifts.
        // Easiest: Sort descending. Delete row 100. Row 10 remains Row 10. Delete row 10.

        rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => {
            requestBody.push({
                deleteDimension: {
                    range: {
                        sheetId: dbSheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex,
                        endIndex: rowIndex + 1
                    }
                }
            });
        });

        const finalUpdates: Promise<any>[] = [];

        if (requestBody.length > 0) {
            finalUpdates.push(sheets.spreadsheets.batchUpdate({
                spreadsheetId: databaseSpreadsheetId,
                requestBody: { requests: requestBody }
            }));
        }

        // 4. Update Tracker (Delete Row, Update Survivor, Update Shifted IDs)
        const { status, pic, remarks } = strategy;

        // We do this in one batchUpdate request to the tracker
        const trackerRequests: any[] = [
            // A. Update Survivor Fields
            {
                updateCells: {
                    range: {
                        sheetId: trackerSheetId,
                        startRowIndex: keepRowIndex,
                        endRowIndex: keepRowIndex + 1,
                        startColumnIndex: 2, // C: Status
                        endColumnIndex: 3
                    },
                    rows: [{ values: [{ userEnteredValue: { stringValue: status } }] }],
                    fields: 'userEnteredValue'
                }
            },
            {
                updateCells: {
                    range: {
                        sheetId: trackerSheetId,
                        startRowIndex: keepRowIndex,
                        endRowIndex: keepRowIndex + 1,
                        startColumnIndex: 5, // F: PIC
                        endColumnIndex: 6
                    },
                    rows: [{ values: [{ userEnteredValue: { stringValue: pic } }] }],
                    fields: 'userEnteredValue'
                }
            },
            {
                updateCells: {
                    range: {
                        sheetId: trackerSheetId,
                        startRowIndex: keepRowIndex,
                        endRowIndex: keepRowIndex + 1,
                        startColumnIndex: 9, // J: Remarks
                        endColumnIndex: 10
                    },
                    rows: [{ values: [{ userEnteredValue: { stringValue: remarks } }] }],
                    fields: 'userEnteredValue'
                }
            },
            // B. Delete the victim row
            {
                deleteDimension: {
                    range: {
                        sheetId: trackerSheetId,
                        dimension: 'ROWS',
                        startIndex: mergeRowIndex,
                        endIndex: mergeRowIndex + 1
                    }
                }
            }
        ];

        // C. Update shifted IDs
        // Note: After deletion, the row indices in the sheet will match newRowIndex.
        shiftedCompanies.forEach(company => {
            trackerRequests.push({
                updateCells: {
                    range: {
                        sheetId: trackerSheetId,
                        startRowIndex: company.newRowIndex,
                        endRowIndex: company.newRowIndex + 1,
                        startColumnIndex: 0, // A: ID
                        endColumnIndex: 1
                    },
                    rows: [{ values: [{ userEnteredValue: { stringValue: company.newId } }] }],
                    fields: 'userEnteredValue'
                }
            });
        });

        finalUpdates.push(sheets.spreadsheets.batchUpdate({
            spreadsheetId: trackerSpreadsheetId,
            requestBody: { requests: trackerRequests }
        }));

        await Promise.all(finalUpdates);

        // 5. Invalidate Cache
        cache.delete('sheet_data');

        return res.status(200).json({
            success: true,
            message: `Merged ${mergeId} into ${keepId}. Physically deleted row and re-sequenced ${shiftedCompanies.length} companies.`,
            contactsUpdated: requestBody.length,
            shiftedCount: shiftedCompanies.length
        });

    } catch (error: any) {
        console.error('Merge Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error'
        });
    }
}
