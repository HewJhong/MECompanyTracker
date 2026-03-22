/**
 * Fix Email_Schedule column A (company id) when it is out of sync with the main company list
 * (e.g. ME-0001 removed from the DB sheet but schedule rows still reference it).
 *
 * Uses the same spreadsheets as the app: main IDs from SPREADSHEET_ID_1 (AUTOMATION DB sheet),
 * Email_Schedule from SPREADSHEET_ID_2 (or SPREADSHEET_ID_1 if _2 unset), matching lib/email-schedule.
 *
 * Usage:
 *   node scripts/fix-email-schedule-company-ids.js           # dry-run (no writes)
 *   node scripts/fix-email-schedule-company-ids.js --apply   # write fixes to column A only
 *
 * Optional manual overrides (applied first if target id exists):
 *   node scripts/fix-email-schedule-company-ids.js --apply --mapping='{"ME-0001":"ME-0002"}'
 *
 * Run from outreach-tracker/: loads .env.local from this folder.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { google } = require('googleapis');

const SCHEDULE_SHEET = 'Email_Schedule';
const DRY_RUN = !process.argv.includes('--apply');

function parseMappingArg() {
    const prefix = '--mapping=';
    const raw = process.argv.find((a) => a.startsWith(prefix));
    if (!raw) return null;
    try {
        return JSON.parse(raw.slice(prefix.length));
    } catch (e) {
        console.error('Invalid --mapping JSON:', e.message);
        process.exit(1);
    }
}

function norm(s) {
    return String(s || '').trim();
}

function buildResolver(companies) {
    const canonicalByIdLower = new Map();
    const nameToIds = new Map();
    for (const c of companies) {
        const id = norm(c.id);
        if (!id) continue;
        const name = norm(c.companyName);
        canonicalByIdLower.set(id.toLowerCase(), { id, companyName: name || id });
        const nk = name.toLowerCase();
        if (!nk) continue;
        if (!nameToIds.has(nk)) nameToIds.set(nk, []);
        nameToIds.get(nk).push(id);
    }

    return (scheduleId, scheduleName) => {
        const rawId = norm(scheduleId);
        const nameFromSheet = norm(scheduleName);
        const nameKey = nameFromSheet.toLowerCase();
        const idsForName = nameKey ? nameToIds.get(nameKey) : undefined;
        const uniqueNameId = idsForName?.length === 1 ? idsForName[0] : null;
        const nameHit = uniqueNameId ? canonicalByIdLower.get(uniqueNameId.toLowerCase()) : undefined;
        const idHit = rawId ? canonicalByIdLower.get(rawId.toLowerCase()) : undefined;
        const namesAgree =
            Boolean(idHit && nameFromSheet && idHit.companyName.trim().toLowerCase() === nameKey);

        if (nameHit && nameFromSheet) {
            if (!idHit || !namesAgree) {
                return { newId: nameHit.id, reason: 'unique_name_match' };
            }
        }
        if (idHit) {
            if (idHit.id !== rawId) {
                return { newId: idHit.id, reason: 'canonical_id_casing' };
            }
            return { newId: rawId, reason: 'ok' };
        }
        return { newId: rawId, reason: 'unresolved' };
    };
}

async function main() {
    const mapping = parseMappingArg();
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

    const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
    const dbSheet = dbMeta.data.sheets?.find((s) => s.properties?.title?.includes('[AUTOMATION ONLY]'));
    const dbSheetName = dbSheet?.properties?.title;
    if (!dbSheetName) {
        console.error('DB sheet with [AUTOMATION ONLY] not found on SPREADSHEET_ID_1');
        process.exit(1);
    }

    const dbRes = await sheets.spreadsheets.values.get({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A2:B`,
    });
    const dbRows = dbRes.data.values || [];
    const idSet = new Set();
    const companies = [];
    for (const row of dbRows) {
        const id = norm(row[0]);
        if (!id) continue;
        if (idSet.has(id)) continue;
        idSet.add(id);
        companies.push({ id, companyName: norm(row[1]) || id });
    }

    const resolve = buildResolver(companies);
    const validLower = new Map(companies.map((c) => [c.id.toLowerCase(), c.id]));

    const schedRes = await sheets.spreadsheets.values.get({
        spreadsheetId: trackerSpreadsheetId,
        range: `${SCHEDULE_SHEET}!A2:J`,
    });
    const schedRows = schedRes.data.values || [];

    const updates = [];
    let unchanged = 0;

    schedRows.forEach((row, i) => {
        const rowNum = i + 2;
        const currentId = norm(row[0]);
        if (!currentId) return;
        const scheduleName = norm(row[1]);

        let targetId = currentId;
        let reason = 'ok';

        if (mapping && typeof mapping === 'object' && mapping[currentId] != null) {
            const mapped = norm(mapping[currentId]);
            if (mapped && validLower.has(mapped.toLowerCase())) {
                targetId = validLower.get(mapped.toLowerCase());
                reason = 'manual_mapping';
            } else {
                console.warn(
                    `Row ${rowNum}: mapping ${currentId} → ${mapped} skipped (target missing in main list)`,
                );
            }
        }

        if (reason !== 'manual_mapping') {
            const r = resolve(currentId, scheduleName);
            targetId = r.newId;
            reason = r.reason;
        }

        if (targetId !== currentId && reason !== 'unresolved') {
            updates.push({ rowNum, from: currentId, to: targetId, reason, scheduleName });
        } else if (reason === 'unresolved' && !validLower.has(currentId.toLowerCase())) {
            console.warn(
                `Row ${rowNum}: could not resolve id "${currentId}" (name: "${scheduleName || '(empty)'}")`,
            );
        } else {
            unchanged += 1;
        }
    });

    console.log(
        DRY_RUN ? 'DRY RUN (no writes). Pass --apply to update column A.\n' : 'APPLYING updates...\n',
    );
    console.log(`Main list companies loaded: ${companies.length}`);
    console.log(`Schedule rows with id: ${schedRows.filter((r) => norm(r[0])).length}`);
    console.log(`Rows to fix: ${updates.length}`);
    updates.forEach((u) => {
        console.log(`  Row ${u.rowNum}: ${u.from} → ${u.to} (${u.reason}) name="${u.scheduleName}"`);
    });

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
        console.log(`Updated ${updates.length} cell(s) in ${SCHEDULE_SHEET} column A.`);
    }

    console.log(`Unchanged / skipped: ${unchanged}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
