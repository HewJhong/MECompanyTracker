import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { disciplineToDatabase } from '../../lib/discipline-mapping';
import { syncDailyStats } from '../../lib/daily-stats';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    try {
        const { companyName, discipline, contactName, contactEmail, contactPhone, assignedTo, remarks } = req.body;

        // Validation
        if (!companyName || !companyName.trim()) {
            return res.status(400).json({ message: 'Company name is required' });
        }

        if (!discipline) {
            return res.status(400).json({ message: 'Discipline is required' });
        }

        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1; // Company Database
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;  // Outreach Tracker

        // 1. Find the canonical company database sheet
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        // 2. Get existing data to determine next ID
        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A:A`, // Just get Company IDs
        });
        const dbRows = dbResponse.data.values || [];

        // Calculate next ID (skip header row)
        const nextIdNumber = dbRows.length; // Header is row 1, so row count = next ID number
        const newCompanyId = `ME-${String(nextIdNumber).padStart(4, '0')}`;

        console.log(`Creating new company with ID: ${newCompanyId}`);

        // 3. Get tracker sheet name
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;

        if (!trackerSheetName) {
            throw new Error('Outreach Tracker sheet not found');
        }

        // 4. Prepare data for database (one row per contact, or one row if no contact)
        const disciplineAbbrev = disciplineToDatabase(discipline);
        const timestamp = new Date().toISOString();

        const databaseRow = [
            newCompanyId,                    // A: Company ID
            companyName.trim(),              // B: Company Name
            disciplineAbbrev,                // C: Discipline
            '',                              // D: Target Sponsorship Tier (empty for now)
            '',                              // E: Priority (empty for now)
            contactName?.trim() || '',       // F: Company PIC
            '',                              // G: Job title/position (empty for now)
            contactEmail?.trim() || '',      // H: Email
            contactPhone?.trim() || '',      // I: Phone Number
            '',                              // J: Landline Number (empty)
            '',                              // K: LinkedIn (empty)
            '',                              // L: Reference (empty)
            '',                              // M: Contact-specific remarks (empty)
            'TRUE'                           // N: Is_Active
        ];

        // 5. Prepare data for tracker
        const trackerRow = [
            newCompanyId,                    // A: Company ID
            companyName.trim(),              // B: Company Name
            'To Contact',                    // C: Contact Status
            '',                              // D: Relationship Status
            '',                              // E: Channel
            '0',                             // F: Urgency Score
            '',                              // G: Previous Response
            assignedTo || 'Unassigned',      // H: Assigned PIC
            '',                              // I: Last Company Contact Date
            '',                              // J: Last Committee Contact Date
            '0',                             // K: Follow Ups Completed
            '',                              // L: Sponsorship Tier
            '',                              // M: Days Attending
            remarks?.trim() || '',           // N: Remarks
            timestamp                        // O: Last Update
        ];

        // 6. Append to both sheets
        await sheets.spreadsheets.values.append({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A:N`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [databaseRow]
            }
        });

        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A:K`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [trackerRow]
            }
        });

        // 7. Log to Thread_History and Logs_DoNotEdit
        if (trackerSpreadsheetId) {
            const actorName = formatActorLabel(ctx);
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Thread_History!A:D',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, newCompanyId, actorName, `Added new company ${companyName}`]] },
            });
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[timestamp, actorName, 'ADD_COMPANY', `${newCompanyId} – ${companyName}`, JSON.stringify({ discipline, assignedTo })]],
                },
            });
        }

        // 8. Clear cache to force refresh
        cache.clear();

        // 9. Sync daily stats
        if (trackerSpreadsheetId) {
            await syncDailyStats(sheets, trackerSpreadsheetId);
        }

        console.log(`✅ Successfully created company ${newCompanyId}: ${companyName}`);

        res.status(200).json({
            message: 'Company added successfully',
            companyId: newCompanyId
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}
