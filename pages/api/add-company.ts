import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { disciplineToDatabase } from '../../lib/discipline-mapping';

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

        // 1. Find the [AUTOMATION ONLY] sheet in the database
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(sheet =>
            sheet.properties?.title?.includes('[AUTOMATION ONLY]')
        );
        const dbSheetName = dbSheet?.properties?.title;

        if (!dbSheetName) {
            throw new Error('Company Database sheet with [AUTOMATION ONLY] label not found');
        }

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
            'To Contact',                    // C: Status
            '',                              // D: Channel
            '0',                             // E: Urgency Score
            '',                              // F: Previous Response
            assignedTo || 'Unassigned',      // G: Assigned PIC
            '',                              // H: Last Company Contact Date
            '',                              // I: Last Committee Contact Date
            '0',                             // J: Follow Ups Completed
            '',                              // K: Sponsorship Tier
            '',                              // L: Days Attending
            remarks?.trim() || '',           // M: Remarks
            timestamp                        // N: Last Update
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

        // 7. Clear cache to force refresh
        cache.clear();

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
