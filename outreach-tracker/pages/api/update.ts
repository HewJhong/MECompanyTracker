import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const members = await getCommitteeMembers();
    const email = session.user.email.toLowerCase().trim();
    const committeeUser = members.find(m => m.email.toLowerCase().trim() === email);
    if (!committeeUser) {
        return res.status(403).json({ message: 'Not authorized to modify data' });
    }

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
            'status': 'C',
            'channel': 'D',
            'urgencyScore': 'E',
            'previousResponse': 'F',
            'assignedPic': 'G', // Changed from 'pic' to 'assignedPic'
            'lastCompanyContact': 'H', // Added
            'lastContact': 'I',
            'followUpsCompleted': 'J',
            'sponsorshipTier': 'K',
            'daysAttending': 'L',
            'remarks': 'M', // Changed from 'remark' to 'remarks'
            'lastUpdate': 'N' // Changed from 'lastUpdated' to 'lastUpdate'
        };

        trackerUpdates.push({
            range: `${trackerSheetName}!${TRACKER_MAP['lastUpdate']}${trackerRowIndex}`,
            values: [[timestamp]]
        });

        Object.entries(updates).forEach(([key, value]) => {
            if (TRACKER_MAP[key]) {
                trackerUpdates.push({
                    range: `${trackerSheetName}!${TRACKER_MAP[key]}${trackerRowIndex}`,
                    values: [[value]]
                });
            }
        });

        // Automatic "No Reply" transition logic - SKIP if status is being manually updated
        let remarkText = remark;
        if (!updates.status) {
            const currentDataRange = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId2,
                range: `${trackerSheetName}!F${trackerRowIndex}:J${trackerRowIndex}`,
            });
            const currentData = currentDataRange.data.values?.[0] || [];
            const currentPreviousResponse = currentData[0]; // F: Previous Response
            const currentFollowUps = parseInt(updates.followUpsCompleted?.toString() || currentData[4]) || 0; // J: Follow-up Count (index 4 in range F:J)

            if (currentFollowUps >= 3 && currentPreviousResponse) {
                const daysSinceResponse = (Date.now() - new Date(currentPreviousResponse).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceResponse > 3) {
                    trackerUpdates.push({
                        range: `${trackerSheetName}!${TRACKER_MAP['status']}${trackerRowIndex}`,
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
        const dbSheet = dbMeta.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const dbSheetName = dbSheet?.properties?.title || dbMeta.data.sheets?.[0].properties?.title;

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
            'priority': 'D'
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
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: spreadsheetId1,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: dbUpdates
                }
            });
        }

        const logSheetName = 'Logs_DoNotEdit';
        await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId2,
            range: `${logSheetName}!A:E`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[timestamp, user, companyId, updates.companyName || '', JSON.stringify(updates)]] }
        });

        if (remarkText) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `Thread_History!A:D`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[actionDate || timestamp, companyId, user, remarkText]] }
            });
        }

        cache.delete('sheet_data');

        // Verify: Fetch the updated status and follow-up count to confirm save
        const verifyRange = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId2,
            range: `${trackerSheetName}!A${trackerRowIndex}:M${trackerRowIndex}`,
        });
        const updatedRow = verifyRange.data.values?.[0] || [];
        const verifiedData = {
            status: updatedRow[2],
            followUpsCompleted: parseInt(updatedRow[9]) || 0,
            lastContact: updatedRow[8],
            lastUpdated: updatedRow[13],
            remark: updatedRow[12],
            daysAttending: updatedRow[11]
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
