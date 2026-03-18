const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SCHEDULE_TIMEZONE_OFFSET = process.env.SCHEDULE_TIMEZONE_OFFSET || '+08:00';

async function getSheetsClient() {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !privateKey) {
        throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in .env.local');
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

function parseDateValue(value) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function sameTimestamp(a, b) {
    const dateA = parseDateValue(a);
    const dateB = parseDateValue(b);
    if (!dateA || !dateB) return false;
    return dateA.getTime() === dateB.getTime();
}

function sameStoredValue(a, b) {
    return String(a || '').trim() !== '' && String(a || '').trim() === String(b || '').trim();
}

function scheduleEntryToIso(date, time) {
    if (!date || !time) return null;
    const localDate = new Date(`${date}T${time}:00${SCHEDULE_TIMEZONE_OFFSET}`);
    if (Number.isNaN(localDate.getTime())) return null;
    return localDate.toISOString();
}

async function getFirstSheetName(sheets, spreadsheetId) {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = metadata.data.sheets?.[0]?.properties?.title;
    if (!sheetName) throw new Error('Tracker sheet not found');
    return sheetName;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const spreadsheetId = process.env.SPREADSHEET_ID_2;

    if (!spreadsheetId) {
        throw new Error('Missing SPREADSHEET_ID_2 in .env.local');
    }

    const sheets = await getSheetsClient();
    const trackerSheetName = await getFirstSheetName(sheets, spreadsheetId);

    const [trackerResponse, scheduleResponse] = await Promise.all([
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${trackerSheetName}!A2:N`,
        }),
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `Email_Schedule!A2:J`,
        }),
    ]);

    const trackerRows = trackerResponse.data.values || [];
    const scheduleRows = scheduleResponse.data.values || [];

    const completedSchedulesByCompany = new Map();
    for (const row of scheduleRows) {
        const companyId = String(row[0] || '').trim();
        const date = String(row[3] || '').trim();
        const time = String(row[4] || '').trim();
        const completed = String(row[9] || '').trim().toUpperCase();

        if (!companyId || completed !== 'Y') continue;

        const isoTimestamp = scheduleEntryToIso(date, time);
        if (!isoTimestamp) continue;

        const epoch = new Date(isoTimestamp).getTime();
        const entries = completedSchedulesByCompany.get(companyId) || [];
        entries.push({ isoTimestamp, date, time, epoch });
        completedSchedulesByCompany.set(companyId, entries);
    }

    completedSchedulesByCompany.forEach(entries => entries.sort((a, b) => a.epoch - b.epoch));

    const updates = [];
    const skipped = [];

    trackerRows.forEach((row, index) => {
        const companyId = String(row[0] || '').trim();
        const companyName = String(row[1] || '').trim();
        const previousResponse = String(row[5] || '').trim();
        const lastContact = String(row[8] || '').trim();

        if (!companyId || !previousResponse || !lastContact) return;
        if (!sameStoredValue(lastContact, previousResponse)) return;

        const completedSchedules = completedSchedulesByCompany.get(companyId) || [];
        if (completedSchedules.length === 0) {
            skipped.push({
                companyId,
                companyName,
                reason: 'No completed Email_Schedule entry found',
            });
            return;
        }

        const previousResponseTimestamp = parseDateValue(previousResponse)?.getTime() ?? null;
        const completedSchedule = previousResponseTimestamp === null
            ? completedSchedules[completedSchedules.length - 1]
            : [...completedSchedules]
                .reverse()
                .find(entry => entry.epoch <= previousResponseTimestamp)
                || completedSchedules[completedSchedules.length - 1];

        if (sameTimestamp(lastContact, completedSchedule.isoTimestamp)) {
            return;
        }

        updates.push({
            companyId,
            companyName,
            rowNumber: index + 2,
            oldLastContact: lastContact,
            previousResponse,
            newLastContact: completedSchedule.isoTimestamp,
            scheduleDate: completedSchedule.date,
            scheduleTime: completedSchedule.time,
        });
    });

    console.log(`Tracker rows scanned: ${trackerRows.length}`);
    console.log(`Completed schedule entries indexed: ${completedSchedulesByCompany.size}`);
    console.log(`Rows eligible for repair: ${updates.length}`);
    console.log(`Rows skipped (no completed schedule match): ${skipped.length}`);

    if (updates.length > 0) {
        console.log('\nPlanned updates:');
        updates.forEach(update => {
            console.log(
                `- ${update.companyId} (${update.companyName || 'Unknown'}) row ${update.rowNumber}: ` +
                `${update.oldLastContact} -> ${update.newLastContact} ` +
                `[from schedule ${update.scheduleDate} ${update.scheduleTime}]`
            );
        });
    }

    if (skipped.length > 0) {
        console.log('\nSkipped rows:');
        skipped.forEach(entry => {
            console.log(`- ${entry.companyId} (${entry.companyName || 'Unknown'}): ${entry.reason}`);
        });
    }

    if (!apply) {
        console.log('\nDry run only. Re-run with --apply to write updates.');
        return;
    }

    if (updates.length === 0) {
        console.log('\nNo tracker rows needed repair.');
        return;
    }

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updates.map(update => ({
                range: `${trackerSheetName}!I${update.rowNumber}`,
                values: [[update.newLastContact]],
            })),
        },
    });

    try {
        const timestamp = new Date().toISOString();
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Logs_DoNotEdit!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    timestamp,
                    'repair-script',
                    'BACKFILL_LAST_CONTACT',
                    `${updates.length} tracker rows`,
                    JSON.stringify(updates.map(({ companyId, rowNumber, newLastContact }) => ({
                        companyId,
                        rowNumber,
                        newLastContact,
                    }))),
                ]],
            },
        });
    } catch (error) {
        console.warn('Updated tracker rows, but failed to append repair log:', error.message);
    }

    console.log(`\nApplied ${updates.length} tracker row updates.`);
}

main().catch(error => {
    console.error('Backfill failed:', error.message);
    process.exit(1);
});
