/**
 * One-time repair: rows where append landed in columns J–S instead of A–J (Google Sheets
 * values.append "logical table" bug — see lib/email-schedule.ts saveEmailScheduleEntries).
 *
 * Detects: column A empty, column J looks like a company ID (ME-xxxx), with data continuing in K,S.
 * Action: copy J..S (10 cells) into A..J, then clear J..S on that row.
 *
 * Usage (from outreach-tracker/):
 *   node scripts/repair-email-schedule-column-shift.js           # dry-run, lists rows
 *   node scripts/repair-email-schedule-column-shift.js --apply   # write fixes
 *
 * Loads .env.local from this folder (same as other scripts).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { google } = require('googleapis');

const SCHEDULE_SHEET = 'Email_Schedule';
const DRY_RUN = !process.argv.includes('--apply');

function norm(s) {
    return String(s ?? '').trim();
}

/** Matches tracker company IDs written in column A (e.g. ME-0515). */
function looksLikeCompanyIdInJ(cell) {
    const s = norm(cell);
    return /^ME-\d+/i.test(s);
}

async function main() {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const spreadsheetId = process.env.SPREADSHEET_ID_2 || process.env.SPREADSHEET_ID_1;
    if (!spreadsheetId) {
        console.error('SPREADSHEET_ID_2 or SPREADSHEET_ID_1 must be set in .env.local');
        process.exit(1);
    }

    // A–S: wide enough to read J–S (indices 9–18) when data was shifted right by 9.
    const range = `${SCHEDULE_SHEET}!A2:S5000`;
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    const rows = res.data.values || [];

    const toFix = [];
    rows.forEach((row, i) => {
        const sheetRow = i + 2;
        const colA = norm(row[0]);
        const colJ = row[9];
        if (colA) return;
        // Misaligned append left A–I empty and put the schedule row starting at J (col 10).
        const firstNineEmpty = row.slice(0, 9).every((c) => !norm(c));
        if (!firstNineEmpty) return;
        if (!looksLikeCompanyIdInJ(colJ)) return;

        const chunk = [];
        for (let c = 0; c < 10; c++) {
            chunk.push(norm(row[9 + c]));
        }
        toFix.push({ sheetRow, values: chunk });
    });

    console.log(
        DRY_RUN
            ? 'DRY RUN — no writes. Pass --apply to move J:S → A:J and clear J:S.\n'
            : 'APPLYING repairs...\n',
    );
    console.log(`Spreadsheet: ${spreadsheetId}`);
    console.log(`Rows scanned (from ${SCHEDULE_SHEET} starting row 2): ${rows.length}`);
    console.log(`Misaligned rows to repair: ${toFix.length}\n`);

    toFix.forEach((t) => {
        console.log(`  Row ${t.sheetRow}: ${t.values[0]} | ${t.values[1] || '(no name)'} | ${t.values[3]} ${t.values[4]}`);
    });

    if (!DRY_RUN && toFix.length > 0) {
        const CHUNK = 100;
        for (let offset = 0; offset < toFix.length; offset += CHUNK) {
            const slice = toFix.slice(offset, offset + CHUNK);
            const data = slice.map((t) => ({
                range: `${SCHEDULE_SHEET}!A${t.sheetRow}:J${t.sheetRow}`,
                values: [t.values],
            }));
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data,
                },
            });
            const clearRanges = slice.map((t) => `${SCHEDULE_SHEET}!J${t.sheetRow}:S${t.sheetRow}`);
            await sheets.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: clearRanges },
            });
            console.log(`  … wrote + cleared rows ${offset + 1}–${offset + slice.length} of ${toFix.length}`);
        }

        console.log(`\nUpdated ${toFix.length} row(s): wrote A:J, cleared J:S.`);
    } else if (!DRY_RUN && toFix.length === 0) {
        console.log('\nNothing to repair.');
    }

    if (DRY_RUN && toFix.length === 0) {
        console.log('No misaligned rows found (A empty + ME-* in J).');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
