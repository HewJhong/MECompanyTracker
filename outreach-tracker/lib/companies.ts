import { getGoogleSheetsClient } from './google-sheets';
import { getCompanyDatabaseSheet } from './spreadsheet-utils';
import { cache } from './cache';
import { disciplineToDatabase } from './discipline-mapping';
import { syncDailyStats } from './daily-stats';
import { withSheetsRetry } from './sheets-retry';
import { TRACKER_FIELD_TO_COLUMN, TRACKER_ROW_INDEX } from './tracker-sheet-columns';
import { extractPlainRejectionReason } from './rejection-reason';
import { loadSheetData, type SheetCompany } from './sheet-data';

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

const UPDATE_READ_ATTEMPTS = 5;
const UPDATE_READ_RETRY_OPTS = { baseDelayMs: 1500 } as const;

export class CompanyNotFoundError extends Error {
    constructor(public readonly companyId: string) {
        super('COMPANY_NOT_FOUND');
        this.name = 'CompanyNotFoundError';
    }
}

export class RejectionReasonRequiredError extends Error {
    constructor() {
        super('REJECTION_REASON_REQUIRED');
        this.name = 'RejectionReasonRequiredError';
    }
}

export class PartialWriteError extends Error {
    constructor(
        public readonly companyId: string,
        public readonly dbError: string,
        public readonly partialLog: string,
    ) {
        super('PARTIAL_WRITE');
        this.name = 'PartialWriteError';
    }
}

export interface UpdateCompanyResult {
    verifiedData: {
        contactStatus: string;
        relationshipStatus: string;
        followUpsCompleted: number;
        lastContact: string;
        lastUpdated: string;
        remark: string;
        daysAttending: string;
    };
    historyLogged: boolean;
    updatedRows: number;
}

export async function updateCompany(
    companyId: string,
    updatesBody: Record<string, unknown>,
    remark: string,
    actionDate: string | undefined,
    actorLabel: string,
): Promise<UpdateCompanyResult> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId1 = process.env.SPREADSHEET_ID_1;
    const spreadsheetId2 = process.env.SPREADSHEET_ID_2;

    if (!spreadsheetId1 || !spreadsheetId2) {
        throw new Error('Spreadsheet IDs are not configured');
    }

    const updates = { ...updatesBody };
    const timestamp = new Date().toISOString();
    const trackerUpdates: { range: string; values: unknown[][] }[] = [];
    const dbUpdates: { range: string; values: unknown[][] }[] = [];

    const trackerMeta = await withSheetsRetry(
        () => sheets.spreadsheets.get({ spreadsheetId: spreadsheetId2 }),
        UPDATE_READ_ATTEMPTS,
        'lib/companies:trackerMeta',
        UPDATE_READ_RETRY_OPTS,
    );
    const trackerSheetName = trackerMeta.data.sheets?.[0].properties?.title;

    const idRange = await withSheetsRetry(
        () => sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId2, range: `${trackerSheetName}!A:A` }),
        UPDATE_READ_ATTEMPTS,
        'lib/companies:idRange',
        UPDATE_READ_RETRY_OPTS,
    );

    const trackerRows = idRange.data.values || [];
    const trackerRowIndex = trackerRows.findIndex(row => row[0] === companyId) + 1;

    if (trackerRowIndex === 0) {
        throw new CompanyNotFoundError(companyId);
    }

    const currentSliceRange = await withSheetsRetry(
        () =>
            sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId2,
                range: `${trackerSheetName}!${TRACKER_FIELD_TO_COLUMN.relationshipStatus}${trackerRowIndex}:${TRACKER_FIELD_TO_COLUMN.daysAttending}${trackerRowIndex}`,
            }),
        UPDATE_READ_ATTEMPTS,
        'lib/companies:currentSlice',
        UPDATE_READ_RETRY_OPTS,
    );
    const curSlice = currentSliceRange.data.values?.[0] || [];
    const currentRelationship = (curSlice[0] ?? '').toString().trim();
    const currentDaysAttending = (curSlice[TRACKER_ROW_INDEX.daysAttending - TRACKER_ROW_INDEX.relationshipStatus] ?? '').toString().trim();
    const currentSponsorshipTier = (curSlice[TRACKER_ROW_INDEX.sponsorshipTier - TRACKER_ROW_INDEX.relationshipStatus] ?? '').toString().trim();

    const requestedRelationship =
        updates.relationshipStatus !== undefined ? (updates.relationshipStatus ?? '').toString().trim() : undefined;
    const leavingRegistered =
        currentRelationship === 'Registered' &&
        requestedRelationship !== undefined &&
        requestedRelationship !== 'Registered';
    const rejectingCompany =
        requestedRelationship !== undefined && requestedRelationship === 'Rejected';
    const transitioningToRejected =
        rejectingCompany && currentRelationship !== 'Rejected';
    const clearingToNone =
        requestedRelationship !== undefined &&
        requestedRelationship === '' &&
        (currentRelationship === 'Registered' || currentRelationship === 'Interested');

    let autoDayClearNote = '';
    if (leavingRegistered) {
        updates.daysAttending = '';
        if (currentDaysAttending) {
            autoDayClearNote = `[Auto] Cleared Days attending (relationship no longer Registered). Previously: ${currentDaysAttending}`;
        }
    }

    let autoSponsorshipClearNote = '';
    if ((rejectingCompany || clearingToNone) && currentSponsorshipTier) {
        updates.sponsorshipTier = '';
        autoSponsorshipClearNote = `[Auto] Cleared Registered Sponsorship (relationship changed to None). Previously: ${currentSponsorshipTier}`;
    }

    let remarkText = typeof remark === 'string' ? remark : '';
    if (transitioningToRejected && !extractPlainRejectionReason(remarkText)) {
        throw new RejectionReasonRequiredError();
    }

    const TRACKER_MAP = TRACKER_FIELD_TO_COLUMN;

    trackerUpdates.push({
        range: `${trackerSheetName}!${TRACKER_MAP['lastUpdate']}${trackerRowIndex}`,
        values: [[timestamp]],
    });

    const keysToWrite = Object.keys(updates).filter(k => k !== 'previousResponse');
    keysToWrite.forEach(key => {
        const col = TRACKER_MAP[key];
        if (col) {
            trackerUpdates.push({
                range: `${trackerSheetName}!${col}${trackerRowIndex}`,
                values: [[(updates as Record<string, unknown>)[key]]],
            });
        }
    });

    if (autoDayClearNote) {
        remarkText = remarkText ? `${remarkText}\n\n${autoDayClearNote}` : autoDayClearNote;
    }
    if (autoSponsorshipClearNote) {
        remarkText = remarkText ? `${remarkText}\n\n${autoSponsorshipClearNote}` : autoSponsorshipClearNote;
    }

    if (!updates.contactStatus) {
        const currentDataRange = await withSheetsRetry(
            () => sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId2,
                range: `${trackerSheetName}!G${trackerRowIndex}:K${trackerRowIndex}`,
            }),
            UPDATE_READ_ATTEMPTS,
            'lib/companies:currentData',
            UPDATE_READ_RETRY_OPTS,
        );
        const currentData = currentDataRange.data.values?.[0] || [];
        const lastCompanyContact = currentData[2];
        const lastContact = currentData[3];
        const currentFollowUps = parseInt(updates.followUpsCompleted?.toString() || currentData[4]) || 0;

        const tsCompany = lastCompanyContact ? new Date(lastCompanyContact).getTime() : 0;
        const tsCommittee = lastContact ? new Date(lastContact).getTime() : 0;
        const lastContactDate = Math.max(tsCompany, tsCommittee);

        if (currentFollowUps >= 3 && lastContactDate > 0) {
            const daysSinceResponse = (Date.now() - lastContactDate) / (1000 * 60 * 60 * 24);
            if (daysSinceResponse > 3) {
                trackerUpdates.push({
                    range: `${trackerSheetName}!${TRACKER_MAP['contactStatus']}${trackerRowIndex}`,
                    values: [['No Reply']],
                });
                remarkText = remarkText || `[Auto] Marked as No Reply after 3 follow-ups with no response for ${Math.floor(daysSinceResponse)} days`;
            }
        }
    }

    if (remarkText) {
        trackerUpdates.push({
            range: `${trackerSheetName}!${TRACKER_MAP['remarks']}${trackerRowIndex}`,
            values: [[remarkText]],
        });
    }

    const DB_MAP: Record<string, string> = {
        companyName: 'B',
        discipline: 'C',
        targetSponsorshipTier: 'D',
    };
    const updateKeys = Object.keys(updates);
    const needsDatabaseSheet = updateKeys.some(k => k in DB_MAP);

    const dbRowIndices: number[] = [];
    if (needsDatabaseSheet) {
        const dbMeta = await withSheetsRetry(
            () => sheets.spreadsheets.get({ spreadsheetId: spreadsheetId1 }),
            UPDATE_READ_ATTEMPTS,
            'lib/companies:dbMeta',
            UPDATE_READ_RETRY_OPTS,
        );
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMeta.data.sheets);

        const dbIdRange = await withSheetsRetry(
            () => sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId1, range: `${dbSheetName}!A:A` }),
            UPDATE_READ_ATTEMPTS,
            'lib/companies:dbIdRange',
            UPDATE_READ_RETRY_OPTS,
        );

        const dbRows = dbIdRange.data.values || [];
        dbRows.forEach((row, index) => {
            if (row[0] === companyId) dbRowIndices.push(index + 1);
        });

        dbRowIndices.forEach(rowIndex => {
            Object.entries(updates).forEach(([key, value]) => {
                if (DB_MAP[key]) {
                    dbUpdates.push({
                        range: `${dbSheetName}!${DB_MAP[key]}${rowIndex}`,
                        values: [[value]],
                    });
                }
            });
        });
    }

    if (trackerUpdates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: spreadsheetId2,
            requestBody: { valueInputOption: 'USER_ENTERED', data: trackerUpdates },
        });
    }

    if (dbUpdates.length > 0) {
        try {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: spreadsheetId1,
                requestBody: { valueInputOption: 'USER_ENTERED', data: dbUpdates },
            });
        } catch (dbErr) {
            const err = dbErr as Error;
            const logDetail = `Tracker updated but Database failed for company ${companyId}: ${err.message}`;
            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: spreadsheetId2,
                    range: 'Logs_DoNotEdit!A:E',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[
                            new Date().toISOString(),
                            actorLabel,
                            'PARTIAL_WRITE_ERROR',
                            logDetail,
                            JSON.stringify({ companyId, operation: 'COMPANY_UPDATE', payload: updates }),
                        ]],
                    },
                });
            } catch { /* log failure is non-fatal */ }
            throw new PartialWriteError(companyId, err.message, logDetail);
        }
    }

    await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId2,
        range: 'Logs_DoNotEdit!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[timestamp, actorLabel, 'COMPANY_UPDATE', `${companyId} – ${updates.companyName || companyId}`, JSON.stringify(updates)]] },
    });

    const historyEntryText = remarkText || (trackerUpdates.length > 1 || dbUpdates.length > 0
        ? `[Update] ${Object.keys(updates).filter(k => updates[k] !== undefined && updates[k] !== '').join(', ')}`
        : '');

    let historyLogged = false;
    if (historyEntryText) {
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: 'Thread_History!A:D',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [[actionDate || timestamp, companyId, actorLabel, historyEntryText]] },
            });
            historyLogged = true;
        } catch (historyErr) {
            const err = historyErr as Error;
            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: spreadsheetId2,
                    range: 'Logs_DoNotEdit!A:E',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[
                            new Date().toISOString(),
                            actorLabel,
                            'THREAD_HISTORY_WRITE_FAILED',
                            `Failed to append Thread_History for ${companyId}: ${err.message}`,
                            JSON.stringify({ companyId, historyEntryText, updates }),
                        ]],
                    },
                });
            } catch { /* non-fatal */ }
        }
    }

    cache.delete('sheet_data');
    await syncDailyStats(sheets, spreadsheetId2);

    const verifyRange = await withSheetsRetry(
        () => sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId2,
            range: `${trackerSheetName}!A${trackerRowIndex}:P${trackerRowIndex}`,
        }),
        UPDATE_READ_ATTEMPTS,
        'lib/companies:verify',
        UPDATE_READ_RETRY_OPTS,
    );
    const updatedRow = verifyRange.data.values?.[0] || [];

    return {
        verifiedData: {
            contactStatus: updatedRow[2] || '',
            relationshipStatus: updatedRow[3] || '',
            followUpsCompleted: parseInt(updatedRow[10]) || 0,
            lastContact: updatedRow[9] || '',
            lastUpdated: updatedRow[15] || '',
            remark: updatedRow[14] || '',
            daysAttending: updatedRow[13] || '',
        },
        historyLogged,
        updatedRows: dbRowIndices.length,
    };
}

export async function listCompanies(options?: { includeArchived?: boolean }): Promise<SheetCompany[]> {
    const result = await loadSheetData();
    if (!result.ok) throw new Error(result.message);
    const companies = result.payload.companies;
    if (options?.includeArchived) return companies;
    return companies.filter(c => !c.isDeleted);
}

export async function getCompany(companyId: string): Promise<SheetCompany | null> {
    const result = await loadSheetData();
    if (!result.ok) throw new Error(result.message);
    return result.payload.companies.find(c => c.id === companyId) ?? null;
}
