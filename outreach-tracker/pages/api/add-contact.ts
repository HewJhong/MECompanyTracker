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
    const roleLower = committeeUser?.role?.toLowerCase() || '';
    const canEditCompanies = committeeUser && (roleLower === 'admin' || roleLower === 'superadmin' || roleLower === 'member' || roleLower === 'committee member');
    if (!canEditCompanies) {
        return res.status(403).json({ message: 'Not authorized to modify data' });
    }

    const { companyId, companyName, discipline, contact, user, historyLog } = req.body;

    if (!companyId || !contact || !contact.name) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        if (!databaseSpreadsheetId) {
            throw new Error('SPREADSHEET_ID_1 is not configured');
        }

        const metadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = metadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const sheetName = dbSheet?.properties?.title || metadata.data.sheets?.[0].properties?.title;

        // Fetch existing company rows to get exact mapping if needed, or just append with provided data
        // For consistency, we try to put empty placeholders for data we don't have for contacts
        // Database Schema:
        // A: ID
        // B: Company Name
        // C: Discipline
        // D: Target Sponsorship Tier
        // E: Priority
        // F: PIC Name
        // G: Role
        // H: Email
        // I: Phone
        // J: Landline
        // K: LinkedIn
        // L: Reference
        // M: Remark
        // N: Is_Active

        const newRow = [
            companyId,
            companyName || '',
            discipline || '',
            '', // Target Sponsorship Tier
            '', // Priority
            contact.name.trim(),
            contact.role?.trim() || '',
            contact.email?.trim() || '',
            contact.phone?.trim() || '',
            '', // Landline
            contact.linkedin?.trim() || '',
            '', // Reference
            contact.remark?.trim() || '',
            contact.isActive ? 'TRUE' : 'FALSE'
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: databaseSpreadsheetId,
            range: `${sheetName}!A:N`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [newRow] }
        });

        if (trackerSpreadsheetId) {
            const timestamp = new Date().toISOString();
            const logSheetName = 'Logs_DoNotEdit';
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: `${logSheetName}!A:E`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, user, 'CONTACT_ADDED', `${companyId} – added contact: ${contact.name || ''}`, JSON.stringify(contact)]] }
            });

            if (historyLog) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: trackerSpreadsheetId,
                    range: `Thread_History!A:D`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[timestamp, companyId, user, historyLog]] }
                });
            }
        }

        cache.delete('sheet_data');

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Contact Add Error:', error);
        res.status(500).json({ message: 'Add Contact Failed' });
    }
}
