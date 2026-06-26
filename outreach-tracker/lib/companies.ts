import { getGoogleSheetsClient } from './google-sheets';
import { getCompanyDatabaseSheet } from './spreadsheet-utils';
import { cache } from './cache';
import { disciplineToDatabase } from './discipline-mapping';
import { syncDailyStats } from './daily-stats';

export interface CreateCompanyParams {
    companyName: string;
    discipline: string;
    contactName?: string;
    contactRole?: string;
    contactEmail?: string;
    contactPhone?: string;
    assignedTo?: string;
    remarks?: string;
    batchLabel?: string;
}

export async function createCompany(
    params: CreateCompanyParams,
    actorLabel: string,
): Promise<{ companyId: string }> {
    const {
        companyName,
        discipline,
        contactName,
        contactRole,
        contactEmail,
        contactPhone,
        assignedTo,
        remarks,
        batchLabel,
    } = params;

    const sheets = await getGoogleSheetsClient();
    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

    if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
        throw new Error('Spreadsheet IDs are not configured');
    }

    const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
    const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

    const dbResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A:A`,
    });
    const dbRows = dbResponse.data.values || [];

    const nextIdNumber = dbRows.length;
    const newCompanyId = `ME-${String(nextIdNumber).padStart(4, '0')}`;

    const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
    const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
    if (!trackerSheetName) throw new Error('Outreach Tracker sheet not found');

    const disciplineAbbrev = disciplineToDatabase(discipline);
    const timestamp = new Date().toISOString();

    const databaseRow = [
        newCompanyId,
        companyName.trim(),
        disciplineAbbrev,
        '', '',
        contactName?.trim() || '',
        contactRole?.trim() || '',
        contactEmail?.trim() || '',
        contactPhone?.trim() || '',
        '', '', '', '',
        'TRUE',
        '', '', '', '',
        batchLabel?.trim() || '',
        timestamp,
    ];

    const trackerRow = [
        newCompanyId,
        companyName.trim(),
        'To Contact', '', '', '0', '',
        assignedTo || 'Unassigned',
        '', '', '0', '', '',
        remarks?.trim() || '',
        timestamp,
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A:T`,
        valueInputOption: 'RAW',
        requestBody: { values: [databaseRow] },
    });

    await sheets.spreadsheets.values.append({
        spreadsheetId: trackerSpreadsheetId,
        range: `${trackerSheetName}!A:K`,
        valueInputOption: 'RAW',
        requestBody: { values: [trackerRow] },
    });

    await sheets.spreadsheets.values.append({
        spreadsheetId: trackerSpreadsheetId,
        range: 'Thread_History!A:D',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[timestamp, newCompanyId, actorLabel, `Added new company ${companyName}`]] },
    });

    await sheets.spreadsheets.values.append({
        spreadsheetId: trackerSpreadsheetId,
        range: 'Logs_DoNotEdit!A:E',
        valueInputOption: 'RAW',
        requestBody: {
            values: [[timestamp, actorLabel, 'ADD_COMPANY', `${newCompanyId} – ${companyName}`, JSON.stringify({ discipline, assignedTo })]],
        },
    });

    cache.clear();
    await syncDailyStats(sheets, trackerSpreadsheetId);

    return { companyId: newCompanyId };
}
