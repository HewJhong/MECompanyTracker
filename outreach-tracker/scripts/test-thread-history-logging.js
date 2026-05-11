const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const RAW_SESSION_COOKIE =
    process.env.TEST_SESSION_COOKIE ||
    process.env.SESSION_COOKIE ||
    process.env.session_cookie ||
    process.env.test_session_cookie ||
    '';
const SESSION_COOKIE = String(RAW_SESSION_COOKIE).replace(/^Cookie:\s*/i, '').trim();
const TEST_USER = process.env.TEST_USER || 'SmokeTest Script';
const TEST_COMPANY_ID = process.env.TEST_COMPANY_ID || '';
const MODE = (process.env.TEST_MODE || process.argv[2] || 'A').toUpperCase();

function assertEnv(value, label) {
    if (!value) throw new Error(`Missing required value: ${label}`);
}

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;
    return headers;
}

async function api(pathname, body, method = 'POST') {
    const res = await fetch(`${BASE_URL}${pathname}`, {
        method,
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch (e) {
        parsed = { raw: text };
    }
    if (!res.ok) {
        throw new Error(`${pathname} failed (${res.status}): ${JSON.stringify(parsed)}`);
    }
    return parsed;
}

async function getAuthSheetsClient() {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;
    assertEnv(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
    assertEnv(privateKey, 'GOOGLE_PRIVATE_KEY');
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

async function getRows(sheets, range) {
    const spreadsheetId = process.env.SPREADSHEET_ID_2;
    assertEnv(spreadsheetId, 'SPREADSHEET_ID_2');
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || [];
}

async function getCompanyTarget() {
    const data = await api('/api/data?refresh=true', null, 'GET');
    const companies = data?.companies || [];
    if (companies.length === 0) throw new Error('No companies returned from /api/data');
    if (TEST_COMPANY_ID) {
        const chosen = companies.find(c => c.id === TEST_COMPANY_ID);
        if (!chosen) throw new Error(`TEST_COMPANY_ID not found: ${TEST_COMPANY_ID}`);
        return chosen;
    }
    return companies[0];
}

async function runA() {
    assertEnv(SESSION_COOKIE, 'TEST_SESSION_COOKIE');
    const runId = `SMOKE-A-${Date.now()}`;
    const company = await getCompanyTarget();
    console.log(`Using company: ${company.id} (${company.companyName || 'N/A'})`);
    console.log(`Run ID: ${runId}`);

    const currentContact = company.contactStatus || 'To Contact';
    const toggledContact = currentContact === 'To Contact' ? 'Contacted' : 'To Contact';
    const updateResult = await api('/api/update', {
        companyId: company.id,
        user: TEST_USER,
        updates: { contactStatus: toggledContact },
        remark: `[SmokeTest] ${runId} /api/update`,
    });
    console.log('Update API response (summary):', JSON.stringify({
        success: updateResult?.success,
        partialSuccess: updateResult?.partialSuccess,
        verifiedContactStatus: updateResult?.verifiedData?.contactStatus,
        verifiedRemark: updateResult?.verifiedData?.remark,
    }));
    console.log('PASS: /api/update');

    await api('/api/bulk-update-status', {
        companyIds: [company.id],
        field: 'contactStatus',
        value: currentContact,
    });
    console.log('PASS: /api/bulk-update-status');

    const schedule = await api('/api/email-schedule', null, 'GET');
    const entries = schedule?.entries || [];
    if (entries.length === 0) {
        console.log('SKIP: /api/email-schedule PUT (no existing schedule entries)');
    } else {
        const target = entries.find(e => e.companyId === company.id) || entries[0];
        await api('/api/email-schedule', {
            entries: [{
                companyId: target.companyId,
                companyName: target.companyName || target.companyId,
                pic: target.pic || 'Unassigned',
                date: target.date,
                time: target.time,
                order: Number.isFinite(target.order) ? target.order : 0,
                note: target.note || '',
                completed: target.completed || '',
            }],
        }, 'PUT');
        console.log('PASS: /api/email-schedule PUT');
    }

    console.log('A complete.');
    return { runId, companyId: company.id };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runB() {
    assertEnv(SESSION_COOKIE, 'TEST_SESSION_COOKIE');
    const sheets = await getAuthSheetsClient();
    const company = await getCompanyTarget();
    const actorHint = TEST_USER;
    const beforeHistory = await getRows(sheets, 'Thread_History!A:D');
    const beforeLogs = await getRows(sheets, 'Logs_DoNotEdit!A:E');

    const { runId, companyId } = await runA();

    // Sheets write visibility can lag; poll a few times before concluding missing rows.
    let afterHistory = await getRows(sheets, 'Thread_History!A:D');
    let afterLogs = await getRows(sheets, 'Logs_DoNotEdit!A:E');
    for (const waitMs of [1500, 2500, 4000]) {
        const hasRun = afterHistory.some(r => (r[1] || '') === companyId && String(r[3] || '').includes(runId));
        if (hasRun) break;
        await sleep(waitMs);
        afterHistory = await getRows(sheets, 'Thread_History!A:D');
        afterLogs = await getRows(sheets, 'Logs_DoNotEdit!A:E');
    }
    const deltaHistory = afterHistory.length - beforeHistory.length;
    const deltaLogs = afterLogs.length - beforeLogs.length;

    const recentHistory = afterHistory.slice(-20);
    const recentLogs = afterLogs.slice(-20);

    const hasCompanyUpdate = recentLogs.some(r => r[2] === 'COMPANY_UPDATE' && (r[3] || '').includes(company.id));
    const hasBulkUpdate = recentLogs.some(r => r[2] === 'BULK_UPDATE_STATUS');
    const hasScheduleAction = recentLogs.some(r => String(r[2] || '').startsWith('SCHEDULE_'));
    const hasRunIdInHistory = afterHistory.some(r =>
        (r[1] || '') === companyId && String(r[3] || '').includes(runId)
    );

    const matchingHistory = afterHistory.filter(r =>
        (r[1] || '') === companyId && String(r[3] || '').includes(runId)
    ).slice(-3);
    const matchingCompanyLogs = afterLogs.filter(r =>
        r[2] === 'COMPANY_UPDATE' && (r[3] || '').includes(companyId)
    ).slice(-3);

    console.log('--- Verification ---');
    console.log(`Thread_History delta: ${deltaHistory}`);
    console.log(`Logs_DoNotEdit delta: ${deltaLogs}`);
    console.log(`Found recent COMPANY_UPDATE log: ${hasCompanyUpdate}`);
    console.log(`Found recent BULK_UPDATE_STATUS log: ${hasBulkUpdate}`);
    console.log(`Found recent SCHEDULE_* log: ${hasScheduleAction}`);
    console.log(`Found runId in Thread_History: ${hasRunIdInHistory}`);
    console.log(`Run ID: ${runId}`);
    if (matchingHistory.length > 0) {
        console.log('Matching Thread_History rows (latest):');
        matchingHistory.forEach(r => console.log(JSON.stringify(r)));
    }
    if (matchingCompanyLogs.length > 0) {
        console.log('Recent COMPANY_UPDATE log rows (latest):');
        matchingCompanyLogs.forEach(r => console.log(JSON.stringify(r)));
    }

    const pass =
        deltaHistory >= 2 &&
        deltaLogs >= 2 &&
        hasCompanyUpdate &&
        hasBulkUpdate &&
        hasRunIdInHistory;
    if (!pass) {
        throw new Error('B verification failed. Check console summary above.');
    }
    console.log('B complete.');
}

async function main() {
    const cookiePreview = SESSION_COOKIE ? `${SESSION_COOKIE.slice(0, 24)}...` : '(missing)';
    console.log(`Running mode ${MODE} against ${BASE_URL}`);
    console.log(`Session cookie detected: ${cookiePreview}`);
    if (MODE === 'A') return runA();
    if (MODE === 'B') return runB();
    throw new Error(`Unknown mode "${MODE}". Use A or B.`);
}

main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
