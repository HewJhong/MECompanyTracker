/**
 * Migration Script: Split single "status" field into "contactStatus" + "relationshipStatus"
 *
 * What this does:
 *   1. Inserts a new blank column D ("Relationship Status") in the Outreach Tracker sheet,
 *      shifting the existing columns D–N right to E–O.
 *   2. Renames column C header to "Contact Status" and sets column D header to "Relationship Status".
 *   3. For companies whose old status was Interested / Registered / Rejected:
 *      - Updates column C (contactStatus) to the mapped contact-action value
 *      - Writes the relationship disposition to column D (relationshipStatus)
 *   4. Leaves all other rows untouched (contactStatus = old status, relationshipStatus = blank).
 *
 * Status mapping:
 *   To Contact  → contactStatus: "To Contact",   relationshipStatus: ""
 *   Contacted   → contactStatus: "Contacted",    relationshipStatus: ""
 *   To Follow Up→ contactStatus: "To Follow Up", relationshipStatus: ""
 *   No Reply    → contactStatus: "No Reply",     relationshipStatus: ""
 *   Interested  → contactStatus: "To Follow Up", relationshipStatus: "Interested"
 *   Registered  → contactStatus: "To Follow Up", relationshipStatus: "Registered"
 *   Rejected    → contactStatus: "No Reply",     relationshipStatus: "Rejected"
 *
 * Usage:
 *   node scripts/migrate-status-split.js             # Live run
 *   node scripts/migrate-status-split.js --dry-run   # Preview only — no writes
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const STATUS_MAP = {
    'Interested': { contactStatus: 'To Follow Up', relationshipStatus: 'Interested' },
    'Registered': { contactStatus: 'To Follow Up', relationshipStatus: 'Registered' },
    'Rejected':   { contactStatus: 'No Reply',     relationshipStatus: 'Rejected' },
};

const CONTACT_ONLY_STATUSES = new Set(['To Contact', 'Contacted', 'To Follow Up', 'No Reply']);

async function getGoogleSheetsClient() {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes,
    });

    return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function migrate() {
    console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be written\n' : '🚀 Starting Status Split Migration...\n');

    // 1. Setup
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId) throw new Error('Missing SPREADSHEET_ID_2 in .env.local');

    // 2. Get sheet metadata (human-readable name + numeric sheetId for batchUpdate)
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const firstSheet = metadata.data.sheets[0];
    const sheetName = firstSheet.properties.title;
    const sheetId = firstSheet.properties.sheetId; // numeric, needed for insertDimension
    console.log(`   Target Sheet: "${sheetName}" (sheetId: ${sheetId})`);

    // 3. Read full data (A1:O to cover header + all columns including the ones that will shift)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:N`,
    });
    const rows = response.data.values || [];
    if (rows.length === 0) {
        console.log('   No data found in sheet. Exiting.');
        return;
    }

    // 4. Idempotency check — abort if migration already ran
    const header = rows[0];
    const colCHeader = (header[2] || '').trim().toLowerCase();
    const colDHeader = (header[3] || '').trim().toLowerCase();

    if (colDHeader === 'relationship status') {
        console.log('   ⚠️  Column D is already "Relationship Status". Migration appears to have run already.');
        console.log('   Exiting without making changes.');
        return;
    }

    if (colCHeader !== 'status' && colCHeader !== 'contact status') {
        console.log(`   ⚠️  Unexpected column C header: "${header[2]}". Expected "Status" or "Contact Status".`);
        console.log('   Aborting to be safe. Please check the sheet manually.');
        return;
    }

    // 5. Analyse existing status values
    const statusCounts = {};
    const dataRows = rows.slice(1); // skip header

    for (const row of dataRows) {
        if (!row[0] || !row[0].trim()) continue; // skip rows without a Company ID
        const status = (row[2] || '').trim();
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    console.log('   Current status distribution:');
    for (const [s, count] of Object.entries(statusCounts)) {
        const willChange = STATUS_MAP[s] ? ` → contactStatus: "${STATUS_MAP[s].contactStatus}", relationshipStatus: "${STATUS_MAP[s].relationshipStatus}"` : ' (contact status only — no change needed)';
        console.log(`     ${count.toString().padStart(3)} × "${s}"${willChange}`);
    }

    // Rows that need a value write (Interested / Registered / Rejected)
    const rowsNeedingWrite = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0] || !row[0].trim()) continue;
        const status = (row[2] || '').trim();
        if (STATUS_MAP[status]) {
            rowsNeedingWrite.push({ rowNum: i + 1, oldStatus: status, mapping: STATUS_MAP[status] });
        }
    }

    console.log(`\n   Rows requiring value updates: ${rowsNeedingWrite.length}`);
    if (rowsNeedingWrite.length > 0) {
        console.log('   Preview of changes:');
        rowsNeedingWrite.slice(0, 10).forEach(({ rowNum, oldStatus, mapping }) => {
            console.log(`     Row ${rowNum}: "${oldStatus}" → C="${mapping.contactStatus}", D="${mapping.relationshipStatus}"`);
        });
        if (rowsNeedingWrite.length > 10) {
            console.log(`     ... and ${rowsNeedingWrite.length - 10} more`);
        }
    }

    if (DRY_RUN) {
        console.log('\n   DRY RUN complete. No changes written.');
        console.log('   Run without --dry-run to apply the migration.');
        return;
    }

    // 6. Insert blank column D (shifts existing D–N to E–O)
    console.log('\n   Inserting new column D (Relationship Status)...');
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                insertDimension: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 3, // insert before index 3 = column D
                        endIndex: 4,   // insert exactly 1 column
                    },
                    inheritFromBefore: false,
                }
            }]
        }
    });
    console.log('   ✅ Column inserted.');

    // 7. Build batch value updates
    const updates = [];

    // Update header row: C1 = "Contact Status", D1 = "Relationship Status"
    updates.push({ range: `${sheetName}!C1`, values: [['Contact Status']] });
    updates.push({ range: `${sheetName}!D1`, values: [['Relationship Status']] });

    // Update data rows that need contactStatus + relationshipStatus written
    for (const { rowNum, mapping } of rowsNeedingWrite) {
        updates.push({ range: `${sheetName}!C${rowNum}`, values: [[mapping.contactStatus]] });
        updates.push({ range: `${sheetName}!D${rowNum}`, values: [[mapping.relationshipStatus]] });
    }

    // 8. Execute batch write
    console.log(`   Writing ${updates.length} cell updates (2 headers + ${rowsNeedingWrite.length * 2} data cells)...`);
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updates,
        }
    });

    // 9. Summary
    const movedToFollowUp = rowsNeedingWrite.filter(r => r.mapping.contactStatus === 'To Follow Up').length;
    const movedToNoReply  = rowsNeedingWrite.filter(r => r.mapping.contactStatus === 'No Reply').length;

    console.log('\n✅ Migration complete!');
    console.log(`   Total data rows processed : ${dataRows.filter(r => r[0] && r[0].trim()).length}`);
    console.log(`   Rows updated (split)       : ${rowsNeedingWrite.length}`);
    console.log(`     → Interested (→ To Follow Up + Interested)  : ${statusCounts['Interested'] || 0}`);
    console.log(`     → Registered (→ To Follow Up + Registered)  : ${statusCounts['Registered'] || 0}`);
    console.log(`     → Rejected   (→ No Reply + Rejected)        : ${statusCounts['Rejected']   || 0}`);
    console.log(`   Rows left unchanged        : ${(dataRows.filter(r => r[0] && r[0].trim()).length) - rowsNeedingWrite.length}`);
    console.log('\n   Column layout is now:');
    console.log('     A: Company ID');
    console.log('     B: Company Name');
    console.log('     C: Contact Status  (was "Status")');
    console.log('     D: Relationship Status  (NEW)');
    console.log('     E: Channel  (was D)');
    console.log('     F: Urgency Score  (was E)');
    console.log('     G: Previous Response  (was F)');
    console.log('     H: Assigned PIC  (was G)');
    console.log('     I: Last Company Contact  (was H)');
    console.log('     J: Last Committee Contact  (was I)');
    console.log('     K: Follow Ups Completed  (was J)');
    console.log('     L: Sponsorship Tier  (was K)');
    console.log('     M: Days Attending  (was L)');
    console.log('     N: Remarks  (was M)');
    console.log('     O: Last Update  (was N)');
    console.log('\n   ⚠️  Deploy updated API code before using the app again.');
}

migrate().catch(err => {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
});
