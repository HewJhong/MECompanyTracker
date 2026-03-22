/**
 * One-time migration: sync Email_Schedule column A (company ID) using company name
 * (column B) as the primary key.
 *
 * Reads canonical ID↔Name from Database [AUTOMATION ONLY] (SPREADSHEET_ID_1).
 * For each Email_Schedule row, looks up the correct ID by company name and updates
 * column A when it differs.
 *
 * Usage:
 *   node scripts/migrate-email-schedule-by-name.js                    # dry-run (no writes)
 *   node scripts/migrate-email-schedule-by-name.js --csv=out.csv     # dry-run, export changes to CSV for review
 *   node scripts/migrate-email-schedule-by-name.js --apply           # write fixes to column A
 *
 * Run from outreach-tracker/: loads .env.local from this folder.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { google } = require('googleapis');

const SCHEDULE_SHEET = 'Email_Schedule';
const DRY_RUN = !process.argv.includes('--apply');

function parseCsvArg() {
    const match = process.argv.find((a) => a.startsWith('--csv='));
    return match ? match.slice(6) : null;
}

function norm(s) {
    return String(s || '').trim();
}

function normalizeName(name) {
    return norm(name).toLowerCase();
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

    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2 || process.env.SPREADSHEET_ID_1;
    if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
        console.error('SPREADSHEET_ID_1 (and optionally _2) must be set in .env.local');
        process.exit(1);
    }

    // Build name → id map from Database (canonical company sheet, excludes Compiled Company List)
    const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
    const compiledList = '[AUTOMATION ONLY] Compiled Company List';
    const dbSheet = dbMeta.data.sheets?.find((s) => {
        const t = s.properties?.title || '';
        if (t === compiledList) return false;
        return t.includes('[AUTOMATION ONLY]');
    });
    const dbSheetName = dbSheet?.properties?.title;
    if (!dbSheetName) {
        console.error('DB sheet with [AUTOMATION ONLY] (excluding Compiled Company List) not found on SPREADSHEET_ID_1');
        process.exit(1);
    }

    const dbRes = await sheets.spreadsheets.values.get({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A2:B`,
    });
    const dbRows = dbRes.data.values || [];
    const nameToId = new Map(); // normalized name → canonical id (single match only)
    const duplicateNames = []; // ambiguous: multiple companies share same name
    for (const row of dbRows) {
        const id = norm(row[0]);
        const name = norm(row[1]);
        if (!id) continue;
        const nk = name ? normalizeName(name) : null;
        if (!nk) continue;
        if (nameToId.has(nk)) {
            if (!duplicateNames.includes(nk)) duplicateNames.push(nk);
            nameToId.delete(nk); // Treat as ambiguous: do not auto-fix
            continue;
        }
        nameToId.set(nk, id);
    }
    if (duplicateNames.length > 0) {
        console.warn(
            `Ambiguous company names (will NOT auto-fix): ${duplicateNames.join(', ')}. ` +
            `These require manual override mapping.`,
        );
    }

    // Read Email_Schedule
    const schedRes = await sheets.spreadsheets.values.get({
        spreadsheetId: trackerSpreadsheetId,
        range: `${SCHEDULE_SHEET}!A2:J`,
    });
    const schedRows = schedRes.data.values || [];

    const updates = [];
    let unchanged = 0;
    const orphaned = [];
    const ambiguous = []; // duplicate names – require manual override

    schedRows.forEach((row, i) => {
        const rowNum = i + 2;
        const currentId = norm(row[0]);
        const scheduleName = norm(row[1]);
        if (!scheduleName) {
            unchanged += 1;
            return;
        }
        const nk = normalizeName(scheduleName);
        const correctId = nameToId.get(nk);

        if (!correctId) {
            if (duplicateNames.includes(nk)) {
                ambiguous.push({ rowNum, name: scheduleName, currentId });
            } else {
                orphaned.push({ rowNum, name: scheduleName, currentId });
            }
            unchanged += 1;
            return;
        }
        if (correctId === currentId) {
            unchanged += 1;
            return;
        }
        updates.push({ rowNum, from: currentId, to: correctId, name: scheduleName });
    });

    const csvFile = parseCsvArg();
    if (csvFile) {
        const header = 'Row,Previous ID,New ID,Company Name,Status';
        const escape = (v) => (String(v || '').includes(',') || String(v || '').includes('"') ? `"${String(v).replace(/"/g, '""')}"` : v);
        const fixRows = updates.map((u) => [u.rowNum, u.from, u.to, u.name, 'Will fix'].map(escape).join(','));
        const orphanRows = orphaned.map((o) => [o.rowNum, o.currentId, '', o.name, 'Orphaned (skipped)'].map(escape).join(','));
        const ambiguousRows = ambiguous.map((a) => [a.rowNum, a.currentId, '', a.name, 'Ambiguous (manual review required)'].map(escape).join(','));
        fs.writeFileSync(csvFile, [header, ...fixRows, ...orphanRows, ...ambiguousRows].join('\n'), 'utf8');
        console.log(`\nExported to ${csvFile}`);
        console.log(`  - ${updates.length} rows to fix (Previous ID → New ID)`);
        if (orphaned.length > 0) console.log(`  - ${orphaned.length} orphaned rows (skipped)`);
        if (ambiguous.length > 0) console.log(`  - ${ambiguous.length} ambiguous rows (manual review required)`);
        console.log('Columns: Row, Previous ID, New ID, Company Name, Status\n');
    }

    console.log(
        DRY_RUN ? 'DRY RUN (no writes). Pass --apply to update column A.\n' : 'APPLYING updates...\n',
    );
    console.log(`Database companies: ${nameToId.size}`);
    console.log(`Schedule rows with data: ${schedRows.filter((r) => norm(r[0]) || norm(r[1])).length}`);
    console.log(`Rows to fix (name→id sync): ${updates.length}`);
    updates.forEach((u) => {
        console.log(`  Row ${u.rowNum}: ${u.from} → ${u.to} (name="${u.name}")`);
    });
    if (orphaned.length > 0) {
        console.log(`\nOrphaned (name not in Database): ${orphaned.length}`);
        orphaned.forEach((o) => {
            console.log(`  Row ${o.rowNum}: name="${o.name}" currentId="${o.currentId}"`);
        });
    }

    if (ambiguous.length > 0) {
        console.log(`\nAmbiguous (not auto-fixed): ${ambiguous.length}`);
        ambiguous.forEach((a) => {
            console.log(`  Row ${a.rowNum}: name="${a.name}" currentId="${a.currentId}" – use override mapping`);
        });
    }

    if (!DRY_RUN && updates.length > 0) {
        const data = updates.map((u) => ({
            range: `${SCHEDULE_SHEET}!A${u.rowNum}`,
            values: [[u.to]],
        }));
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: trackerSpreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data,
            },
        });
        console.log(`\nUpdated ${updates.length} cell(s) in ${SCHEDULE_SHEET} column A.`);
    }

    console.log(`\nUnchanged: ${unchanged}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
