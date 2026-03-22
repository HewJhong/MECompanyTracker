import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
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
        const { title: sheetName } = getCompanyDatabaseSheet(metadata.data.sheets);

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
            contact.isActive ? 'TRUE' : 'FALSE',
            '', // O: activeMethods (comma-separated)
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: databaseSpreadsheetId,
            range: `${sheetName}!A:O`,
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
                requestBody: { values: [[timestamp, formatActorLabel(ctx), 'CONTACT_ADDED', `${companyId} – added contact: ${contact.name || ''}`, JSON.stringify(contact)]] }
            });

            if (historyLog) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: trackerSpreadsheetId,
                    range: `Thread_History!A:D`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[timestamp, companyId, formatActorLabel(ctx), historyLog]] }
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
