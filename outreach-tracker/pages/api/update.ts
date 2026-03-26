import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { syncDailyStats } from '../../lib/daily-stats';
import { requireEffectiveCanEditCompanies } from '../../lib/authz';
import { formatActorLabel } from '../../lib/authz';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const { companyId, updates, user, remark, actionDate } = req.body;

    if (!companyId || !user) {
        return res.status(400).json({ message: 'Missing required fields (companyId, user)' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId1 = process.env.SPREADSHEET_ID_1;
        const spreadsheetId2 = process.env.SPREADSHEET_ID_2;

        if (!spreadsheetId1 || !spreadsheetId2) {
            throw new Error('Spreadsheet IDs are not configured');
        }

        const timestamp = new Date().toISOString();
        const trackerUpdates: any[] = [];
        const dbUpdates: any[] = [];

        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId2 });
        const trackerSheetName = trackerMeta.data.sheets?.[0].properties?.title;

        const idRange = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId2,
            range: `${trackerSheetName}!A:A`,
        });

        const trackerRows = idRange.data.values || [];
        const trackerRowIndex = trackerRows.findIndex(row => row[0] === companyId) + 1;

        if (trackerRowIndex === 0) {
            return res.status(404).json({ message: 'Company not found in Outreach Tracker' });
        }

        const TRACKER_MAP: Record<string, string> = {
            'companyName': 'B',
            'contactStatus': 'C',
            'relationshipStatus': 'D',
            'channel': 'E',
            'urgencyScore': 'F',
            'previousResponse': 'G',
            'assignedPic': 'H',
            'lastCompanyContact': 'I',
            'lastContact': 'J',
            'followUpsCompleted': 'K',
            'sponsorshipTier': 'M',
            'daysAttending': 'N',
            'remarks': 'O',
            'lastUpdate': 'P'
        };

        trackerUpdates.push({
            range: `${trackerSheetName}!${TRACKER_MAP['lastUpdate']}${trackerRowIndex}`,
            values: [[timestamp]]
        });

        // previousResponse (Column F) is historical and must not be overwritten by app updates
        const keysToWrite = Object.keys(updates).filter(k => k !== 'previousResponse');
        keysToWrite.forEach((key) => {
            const col = TRACKER_MAP[key];
            if (col) {
                trackerUpdates.push({
                    range: `${trackerSheetName}!${col}${trackerRowIndex}`,
                    values: [[(updates as Record<string, unknown>)[key]]]
                });
            }
        });

        // Automatic "No Reply" transition logic - SKIP if contactStatus is being manually updated
        // Uses last company contact (I) or last committee contact (J), whichever is more recent
        let remarkText = remark;
        if (!updates.contactStatus) {
            const currentDataRange = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId2,
                range: `${trackerSheetName}!G${trackerRowIndex}:K${trackerRowIndex}`,
            });
            const currentData = currentDataRange.data.values?.[0] || [];
            const lastCompanyContact = currentData[2]; // I
            const lastContact = currentData[3];         // J (committee contact)
            const currentFollowUps = parseInt(updates.followUpsCompleted?.toString() || currentData[4]) || 0; // K

            const tsCompany = lastCompanyContact ? new Date(lastCompanyContact).getTime() : 0;
            const tsCommittee = lastContact ? new Date(lastContact).getTime() : 0;
            const lastContactDate = Math.max(tsCompany, tsCommittee);

            if (currentFollowUps >= 3 && lastContactDate > 0) {
                const daysSinceResponse = (Date.now() - lastContactDate) / (1000 * 60 * 60 * 24);
                if (daysSinceResponse > 3) {
                    trackerUpdates.push({
                        range: `${trackerSheetName}!${TRACKER_MAP['contactStatus']}${trackerRowIndex}`,
                        values: [['No Reply']]
                    });
                    remarkText = remarkText || `[Auto] Marked as No Reply after 3 follow-ups with no response for ${Math.floor(daysSinceResponse)} days`;
                }
            }
        }

        if (remarkText) {
            trackerUpdates.push({
                range: `${trackerSheetName}!${TRACKER_MAP['remarks']}${trackerRowIndex}`,
                values: [[remarkText]]
            });
        }

        const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId1 });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMeta.data.sheets);

        const dbIdRange = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId1,
            range: `${dbSheetName}!A:A`,
        });

        const dbRows = dbIdRange.data.values || [];
        const dbRowIndices: number[] = [];
        dbRows.forEach((row, index) => {
            if (row[0] === companyId) dbRowIndices.push(index + 1);
        });

        const DB_MAP: Record<string, string> = {
            'companyName': 'B',
            'discipline': 'C',
            'targetSponsorshipTier': 'D'
        };

        dbRowIndices.forEach(rowIndex => {
            Object.entries(updates).forEach(([key, value]) => {
                if (DB_MAP[key]) {
                    dbUpdates.push({
                        range: `${dbSheetName}!${DB_MAP[key]}${rowIndex}`,
                        values: [[value]]
                    });
                }
            });
        });

        if (trackerUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: spreadsheetId2,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: trackerUpdates
                }
            });
        }

        if (dbUpdates.length > 0) {
            try {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: spreadsheetId1,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: dbUpdates
                    }
                });
            } catch (dbErr) {
                const err = dbErr as Error;
                console.error('Database write failed after Tracker succeeded (partial dual-write):', err);
                try {
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: spreadsheetId2,
                        range: 'Logs_DoNotEdit!A:E',
                        valueInputOption: 'RAW',
                        requestBody: {
                            values: [[
                                new Date().toISOString(),
                                formatActorLabel(ctx),
                                'PARTIAL_WRITE_ERROR',
                                `Tracker updated but Database failed for company ${companyId}: ${err.message}`,
                                JSON.stringify({ companyId, operation: 'COMPANY_UPDATE', payload: updates }),
                            ]],
                        },
                    });
                } catch (logErr) {
                    console.error('Could not log partial write error:', logErr);
                }
                return res.status(207).json({
                    success: false,
                    message: `Tracker was updated but Database sync failed. Data may be out of sync. Company: ${companyId}. Check Logs_DoNotEdit for details.`,
                    partialSuccess: { tracker: true, database: false },
                });
            }
        }

        const logSheetName = 'Logs_DoNotEdit';
        await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId2,
            range: `${logSheetName}!A:E`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[timestamp, user, 'COMPANY_UPDATE', `${companyId} – ${updates.companyName || companyId}`, JSON.stringify(updates)]] }
        });

        // Always log to Thread_History when there are updates so the history panel shows the latest activity.
        const historyEntryText = remarkText || (trackerUpdates.length > 1 || dbUpdates.length > 0
            ? `[Update] ${Object.keys(updates).filter(k => updates[k] !== undefined && updates[k] !== '').join(', ')}`
            : '');
        if (historyEntryText) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `Thread_History!A:D`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[actionDate || timestamp, companyId, formatActorLabel(ctx), historyEntryText]] }
            });
        }

        cache.delete('sheet_data');

        // Schedule entries are no longer auto-deleted when contact is logged. Entries remain in
        // Email_Schedule for full history; the Email Schedule page shows them with a green border.
        // Committee workspace hides scheduled date/time when status is Contacted.

        // Sync daily stats after any updates
        await syncDailyStats(sheets, spreadsheetId2);

        // Verify: Fetch the updated row (A–P) to confirm save; lastUpdate is column P
        const verifyRange = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId2,
            range: `${trackerSheetName}!A${trackerRowIndex}:P${trackerRowIndex}`,
        });
        const updatedRow = verifyRange.data.values?.[0] || [];
        const verifiedData = {
            contactStatus: updatedRow[2],
            relationshipStatus: updatedRow[3],
            followUpsCompleted: parseInt(updatedRow[10]) || 0,
            lastContact: updatedRow[9],   // J: Last Committee Contact Date
            lastUpdated: updatedRow[15],  // P: Last Update
            remark: updatedRow[14],       // O: Remarks
            daysAttending: updatedRow[13] // N: Days Attending
        };

        res.status(200).json({
            success: true,
            updatedRows: dbRowIndices.length,
            verifiedData
        });

    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ message: 'Update Failed' });
    }
}
