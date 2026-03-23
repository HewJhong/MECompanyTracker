/**
 * Debug why a company may still appear in the app after being "archived" in Sheets.
 *
 * The app reads soft-delete from the **Tracker** main sheet column P (index 15), not from
 * the Database sheet alone. `/api/data` filters with: row[15] trimmed uppercased === 'Y'.
 *
 * Usage (from outreach-tracker/):
 *   node scripts/debug-archive-status.js
 *   node scripts/debug-archive-status.js "KONE Malaysia"
 *
 * Requires .env.local with GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
 * SPREADSHEET_ID_1 (database), SPREADSHEET_ID_2 (tracker).
 */

const path = require('path');
const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const COMPILED_COMPANY_LIST = '[AUTOMATION ONLY] Compiled Company List';
const PREFERRED_COMPANY_DB_NAMES = [
    '[AUTOMATION ONLY] Outreach Tracker',
    '[AUTOMATION ONLY] Company Database',
    '[AUTOMATION ONLY] Compiled Company List',
    '[AUTOMATION ONLY]',
];

function getCompanyDatabaseSheetTitle(sheets) {
    if (!sheets || sheets.length === 0) throw new Error('No sheets in database spreadsheet');
    for (const preferred of PREFERRED_COMPANY_DB_NAMES) {
        const match = sheets.find(s => (s.properties?.title ?? '') === preferred);
        if (match?.properties?.title) return String(match.properties.title);
    }
    const candidates = sheets.filter(s => {
        const title = (s.properties?.title ?? '') || '';
        if (title === COMPILED_COMPANY_LIST) return false;
        return title.includes('[AUTOMATION ONLY]');
    });
    if (candidates.length === 0) {
        throw new Error('Company Database sheet not found');
    }
    if (candidates.length > 1) {
        throw new Error(`Ambiguous DB sheets: ${candidates.map(c => c.properties?.title).join(', ')}`);
    }
    return String(candidates[0].properties?.title || '');
}

function normalizeName(s) {
    return (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

function nameMatches(cell, search) {
    const a = normalizeName(cell);
    const b = normalizeName(search);
    return a.includes(b) || b.includes(a);
}

function deletedFromRowP(row) {
    const p = row[15];
    return (p || '').toString().trim().toUpperCase() === 'Y';
}

async function main() {
    const searchName = process.argv[2] || 'KONE Malaysia';

    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey && privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!privateKey || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        console.error('Missing GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL in .env.local');
        process.exit(1);
    }

    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
        console.error('Missing SPREADSHEET_ID_1 or SPREADSHEET_ID_2');
        process.exit(1);
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    console.log('=== Archive / soft-delete debug ===\n');
    console.log(`Search name: "${searchName}"\n`);
    console.log('App rule: Tracker main sheet column P (16th column, index 15) must be "Y" for the row with that company ID.\n');

    // Tracker
    const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
    const trackerSheetName = trackerMeta.data.sheets?.[0]?.properties?.title;
    if (!trackerSheetName) {
        console.error('Tracker: no first sheet');
        process.exit(1);
    }

    const trackerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: trackerSpreadsheetId,
        range: `${trackerSheetName}!A2:P`,
    });
    const trackerRows = trackerRes.data.values || [];

    console.log(`--- Tracker (${trackerSpreadsheetId}) sheet "${trackerSheetName}" ---\n`);
    let trackerHits = 0;
    const trackerHitRows = [];
    trackerRows.forEach((row, i) => {
        const sheetRow = i + 2;
        const id = (row[0] || '').toString().trim();
        const name = (row[1] || '').toString().trim();
        if (!nameMatches(name, searchName)) return;
        trackerHits++;
        trackerHitRows.push({ sheetRow, row });
        const len = row.length;
        const colP = row[15];
        const del = deletedFromRowP(row);
        console.log(`Row ${sheetRow}: id=${id || '(empty)'} name="${name}"`);
        console.log(`  columns returned: ${len} (need >= 16 for col P in A:P range)`);
        console.log(`  raw P (column 16): ${JSON.stringify(colP)}`);
        console.log(`  interpreted deleted (Y): ${del}`);
        if (len < 16) {
            console.log('  ⚠️  Row is SHORT: Google Sheets may omit trailing empty cells. Verifying column P with a direct read...');
        }
        if (!del && colP !== undefined && String(colP).trim() !== '') {
            console.log(`  ⚠️  P is not "Y": ${JSON.stringify(colP)}`);
        }
        console.log('');
    });

    for (const { sheetRow, row } of trackerHitRows) {
        const len = row.length;
        if (len >= 16) continue;
        try {
            const pOnly = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: `${trackerSheetName}!P${sheetRow}`,
            });
            const cell = pOnly.data.values?.[0]?.[0];
            console.log(`  Direct read ${trackerSheetName}!P${sheetRow}: ${JSON.stringify(cell)}`);
            const delDirect = (cell || '').toString().trim().toUpperCase() === 'Y';
            console.log(`  → deleted per direct P read: ${delDirect}`);
        } catch (e) {
            console.log(`  Direct P read failed: ${e.message}`);
        }
        console.log('');
    }
    if (trackerHits === 0) {
        console.log('No tracker rows matched this name.\n');
    }

    // Database
    const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
    let dbSheetName;
    try {
        dbSheetName = getCompanyDatabaseSheetTitle(dbMeta.data.sheets || []);
    } catch (e) {
        console.error('Database sheet resolution failed:', e.message);
        process.exit(1);
    }

    const dbRes = await sheets.spreadsheets.values.get({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A2:P`,
    });
    const dbRows = dbRes.data.values || [];

    console.log(`--- Database (${databaseSpreadsheetId}) sheet "${dbSheetName}" ---\n`);
    console.log('Note: /api/data uses Tracker P for isDeleted; Database P alone does not hide the company.\n');

    let dbHits = 0;
    dbRows.forEach((row, i) => {
        const sheetRow = i + 2;
        const id = (row[0] || '').toString().trim();
        const name = (row[1] || '').toString().trim();
        if (!nameMatches(name, searchName)) return;
        dbHits++;
        const len = row.length;
        const colP = row[15];
        console.log(`Row ${sheetRow}: id=${id || '(empty)'} name="${name}"`);
        console.log(`  columns returned: ${len}`);
        console.log(`  raw P (Deleted in DB): ${JSON.stringify(colP)}`);
        console.log('');
    });
    if (dbHits === 0) {
        console.log('No database rows matched this name.\n');
    }

    // Cross-check IDs: for each DB id with matching name, show tracker deleted
    const dbIdsForName = new Set();
    dbRows.forEach((row) => {
        const id = (row[0] || '').toString().trim();
        const name = (row[1] || '').toString().trim();
        if (id && nameMatches(name, searchName)) dbIdsForName.add(id);
    });

    const trackerById = new Map();
    trackerRows.forEach((row, i) => {
        const id = (row[0] || '').toString().trim();
        if (!id) return;
        trackerById.set(id, { sheetRow: i + 2, row });
    });

    console.log('--- Cross-check (IDs from Database name matches → Tracker row) ---\n');
    if (dbIdsForName.size === 0) {
        console.log('No IDs to cross-check.\n');
    } else {
        for (const id of dbIdsForName) {
            const t = trackerById.get(id);
            if (!t) {
                console.log(`ID ${id}: NOT FOUND in Tracker → app may show company from DB-only path or missing tracker row.`);
                continue;
            }
            const { sheetRow, row } = t;
            const del = deletedFromRowP(row);
            console.log(`ID ${id}: Tracker row ${sheetRow}, deleted=${del}, P=${JSON.stringify(row[15])}, rowLength=${row.length}`);
            if (!del) {
                console.log(`  → Company still appears in app because Tracker P is not "Y" for this ID.`);
            }
        }
        console.log('');
    }

    console.log('--- If column P looks wrong, try fetching P only for one row ---');
    console.log('Example: set TRACKER_ROW=123 and run column P get, or widen range in Sheets UI.\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
