# Data Integrity Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the known cross-sheet data integrity issues between the Database, Tracker, Email Schedule, and audit sheets without introducing more divergence.

**Architecture:** The app currently uses `SPREADSHEET_ID_1` as the company database and `SPREADSHEET_ID_2` as the operational tracker. Several handlers merge or dual-write data across these sheets, so the safest approach is to standardize source-of-truth rules, make every renumber/sync path update all dependent sheets, and improve pre-flight visibility before risky operations.

**Tech Stack:** Next.js API routes, React settings/admin UI, Google Sheets API, in-memory LRU cache, Node.js maintenance scripts

---

## Scope

This plan covers the previously identified fixes:

1. `id-gaps/fix` does not update `Email_Schedule`
2. `/api/data` prefers Tracker company names over Database names
3. `import/previous-responses` writes to the wrong place for app-visible data
4. Dual writes can partially succeed and leave Database/Tracker diverged
5. `[AUTOMATION ONLY]` sheet selection is ambiguous
6. Email schedule migration script silently resolves duplicate names incorrectly
7. Cache staleness across instances
8. Tracker-only companies should trigger a user alert, not silently disappear
9. Deleted companies leave history/log records behind by design, but this should be explicit
10. Environment validation is fragmented
11. `add-contact` does not populate the full contact schema
12. ID gap fixing needs better audit/revert information in logs
13. Risky ID renumbering must stay Superadmin-only with a comprehensive preview

## Current State Notes

Two related changes have already been made separately and should remain compatible with this plan:

- The Settings UI no longer exposes the old Data Management tab.
- The email schedule migration script now supports dry-run review and CSV export before `--apply`.

## Source of Truth Rules

These rules should be made explicit in code comments and followed consistently:

- **Database (`SPREADSHEET_ID_1`)** is authoritative for company identity fields:
  - company ID
  - company name
  - discipline
  - target sponsorship tier
  - contact rows
- **Tracker (`SPREADSHEET_ID_2`)** is authoritative for operational workflow fields:
  - contact status
  - relationship status
  - assignment
  - remarks
  - email scheduling
  - daily stats
  - logs / thread history
- **Audit sheets** (`Logs_DoNotEdit`, `Thread_History`) are immutable history. They may be augmented with corrective entries but should not be casually rewritten, except where an ID translation is required to preserve future lookup integrity.

## Task 1: Fix Company Name Source Priority

**Files:**

- Modify: `pages/api/data.ts`

**Problem:**
The merged company object prefers the Tracker copy of the name:

```ts
companyName: t?.companyName || row[1] || 'Unknown',
```

This conflicts with the documented rule that the Database is the source of truth for company identity. It also conflicts with the existing mismatch checker, which already treats the Database name as canonical.

**Required change:**
Reverse the priority so the Database name is used first:

```ts
companyName: row[1] || t?.companyName || 'Unknown',
```

**Relevant code:**

```137:137:pages/api/data.ts
companyName: t?.companyName || row[1] || 'Unknown',
```

**Expected result:**

- All UI views that consume `/api/data` show the Database name by default.
- Tracker name mismatches remain visible as mismatches rather than leaking into normal display.

## Task 2: Make ID Gap Renumbering Update Email Schedule

**Files:**

- Modify: `pages/api/id-gaps/fix.ts`

**Problem:**
`id-gaps/fix.ts` updates:

- Database IDs
- Tracker IDs
- `Thread_History` company IDs

But it does not update `Email_Schedule!A`, so schedule rows can keep stale IDs after a renumber.

**Relevant code:**

```109:147:pages/api/id-gaps/fix.ts
// 4. Perform Updates
await Promise.all([
    sheets.spreadsheets.values.update({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A2:A${newDbRows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: newDbRows },
    }),
    sheets.spreadsheets.values.update({
        spreadsheetId: trackerSpreadsheetId,
        range: `${trackerSheetName}!A2:A${newTrackerRows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: newTrackerRows },
    })
]);

// 5. Update Thread_History so activity logs still match companies (column B = companyId)
```

**Required change:**
Add a new step after Tracker/Database ID writes and before logs that:

- reads `Email_Schedule!A2:A`
- maps each ID through `idMap`
- writes back the updated values if any changed
- invalidates schedule cache if needed

**Implementation reference:**
Reuse the same pattern already implemented in `pages/api/sync-database.ts` for schedule ID healing.

**Expected result:**

- Renumbering no longer leaves broken schedule links.
- Company detail pages and email schedule remain aligned after an ID gap fix.

## Task 3: Make ID Gap Renumbering Revertable and Fully Audited

**Files:**

- Modify: `pages/api/id-gaps/fix.ts`

**Problem:**
The current renumber path only appends one forward log entry and one thread-history summary. That is not enough if a revert is ever required.

**Current logging:**

```149:173:pages/api/id-gaps/fix.ts
await sheets.spreadsheets.values.append({
    spreadsheetId: trackerSpreadsheetId,
    range: 'Logs_DoNotEdit!A:E',
    valueInputOption: 'RAW',
    requestBody: {
        values: [[
            now,
            actorName,
            'RENUMBER',
            `Renumbered ${changes.length} companies to close ID gaps`,
            JSON.stringify(changes),
        ]],
    },
});
```

**Required change:**
Replace the single `RENUMBER` log strategy with:

- `RENUMBER_APPLY`
  - includes the full forward map (`oldId -> newId`)
  - includes sheet-level counts affected
  - includes an operation ID
- `RENUMBER_REVERT_MAP`
  - includes the reverse map (`newId -> oldId`)
  - includes the same operation ID

Also include the operation ID in `Thread_History`.

**Expected result:**

- Every renumber is traceable.
- A future revert script or manual emergency recovery can use the stored reverse map.

## Task 4: Make ID Gap Fix Superadmin-Only With a Mandatory Preview

**Files:**

- Modify: `pages/api/id-gaps/fix.ts`
- Modify: `pages/api/id-gaps/scan.ts`
- Modify: `pages/settings.tsx` or the replacement admin surface that will host this flow

**Problem:**
ID renumbering is too risky to run as a simple one-click action. It changes identity keys across multiple sheets and should never be executed without a full preview.

**Required change:**

- Keep the API restricted to Superadmin only
- Add a preview mode to the fix path (or a companion preview endpoint) that returns:
  - proposed old/new IDs
  - company names
  - affected row counts for:
    - Database
    - Tracker
    - Email_Schedule
    - Thread_History
  - operation ID
  - reverse map summary
- Require the apply step to include the preview operation ID

**UI behavior:**

- First screen: show gaps and proposed renumber list
- Second screen: show a per-sheet impact summary
- Final confirmation: explicit acknowledgement before apply

**Expected result:**

- No one renumbers IDs blindly.
- The preview is comprehensive enough to review before applying.

## Task 5: Fix Import Previous Responses So the App Actually Sees It

**Files:**

- Modify: `pages/api/import/previous-responses.ts`
- Review: `pages/api/data.ts`

**Problem:**
The import currently updates `[AUTOMATION ONLY] Compiled Company List` column E in the Database spreadsheet, but the app reads `previousResponse` from Tracker column G when building `/api/data`.

**Relevant code:**

```97:176:pages/api/import/previous-responses.ts
// Target is strictly "[AUTOMATION ONLY] Compiled Company List" in the same spreadsheet
const targetSheetName = targetMetadata.data.sheets?.find(s => s.properties?.title === '[AUTOMATION ONLY] Compiled Company List')?.properties?.title;

const targetResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: databaseSpreadsheetId,
    range: `${targetSheetName}!A2:E`,
});

// Update column E (Previous Response) in target sheet (Index 4)
batchUpdates.push({
    range: `${targetSheetName}!E${index + 2}`,
    values: [[previousResponse]]
});
```

**Required change:**
After the Database-side import finishes, also update Tracker column G for matched companies so the app sees the imported value immediately.

**Expected result:**

- Imported previous responses become visible in the app.
- Database-side archival/staging data can still be preserved if needed.

## Task 6: Add Guardrails for Partial Dual Writes

**Files:**

- Modify: `pages/api/update.ts`
- Modify: `pages/api/add-contact.ts`
- Modify: `pages/api/update-contact.ts`
- Modify: `pages/api/delete-contact.ts`
- Modify: `pages/api/set-primary-contact.ts`

**Problem:**
Several handlers write to Tracker and Database sequentially. If the first write succeeds and the second fails, the two sources diverge.

**Relevant code:**

```155:172:pages/api/update.ts
if (trackerUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId2,
        requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: trackerUpdates
        }
    });
}

if (dbUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId1,
        requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: dbUpdates
        }
    });
}
```

**Required change:**
For each dual-write path:

- wrap the second write in explicit error handling
- append an error log entry if a partial write occurs
- return a warning response that clearly states which side succeeded
- include enough context (`companyId`, operation, payload) in logs for manual reconciliation

**Optional stretch improvement:**
Create a shared helper for “operational write + canonical write + partial failure log”.

**Expected result:**

- Partial failures are no longer silent.
- Operators have enough information to reconcile the data.

## Task 7: Remove Ambiguous `[AUTOMATION ONLY]` Sheet Selection

**Files:**

- Create: `lib/spreadsheet-utils.ts`
- Modify all API routes/scripts that currently do `includes('[AUTOMATION ONLY]')`

**Problem:**
Multiple sheets can match `[AUTOMATION ONLY]`, especially:

- `[AUTOMATION ONLY] Compiled Company List`
- the real automation/company database sheet

Using `includes('[AUTOMATION ONLY]')` can select the wrong sheet depending on order.

**Example current pattern:**

```ts
const dbSheet = dbMetadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
```

**Required change:**
Create a utility that:

- uses an exact allowlist/preferred name strategy
- explicitly excludes the Compiled Company List where necessary
- throws loudly if multiple ambiguous matches remain

**Expected result:**

- All routes agree on the same canonical company database sheet.

## Task 8: Make Email Schedule Migration Safe Around Duplicate Company Names

**Files:**

- Modify: `scripts/migrate-email-schedule-by-name.js`

**Problem:**
The script currently warns about duplicate names but still uses the first matching ID:

```js
if (nameToId.has(nk)) {
    if (!duplicateNames.includes(nk)) duplicateNames.push(nk);
    continue; // first occurrence wins
}
```

This is not safe for ambiguous names like `Intel`, `Petronas`, etc.

**Required change:**

- treat duplicate-name matches as ambiguous
- do not auto-fix those rows
- export them as `Ambiguous (manual review required)` in the CSV preview
- only allow them to be fixed through an explicit override mapping

**Expected result:**

- The migration never silently links a schedule row to the wrong company.

## Task 9: Shorten Cache TTL and Document Multi-Instance Risk

**Files:**

- Modify: `lib/cache.ts`

**Problem:**
Cache invalidation is in-memory and process-local. In multi-instance deployment, one instance can serve stale data after another instance updates Sheets.

**Relevant code:**

```1:8:lib/cache.ts
const options = {
    max: 500, // Maximum number of items
    ttl: 1000 * 60, // 1 minute TTL
    allowStale: false,
};
```

**Required change:**

- reduce TTL from 60s to 30s
- add a comment explaining that this is not shared across instances
- note that a shared cache is the long-term solution if cross-instance freshness becomes important

**Expected result:**

- Staleness window is reduced.
- The tradeoff is explicit in code.

## Task 10: Alert When Companies Exist in Tracker but Not Database

**Files:**

- Modify: `pages/api/data.ts`
- Modify: `pages/companies.tsx`

**Problem:**
Tracker-only companies are currently invisible because `/api/data` iterates Database rows and enriches from Tracker. The user asked for an alert instead of silently showing incomplete rows.

**Required change:**
In `/api/data`:

- scan Tracker rows for IDs not present in the Database-derived company map
- return `trackerOnlyCompanies` metadata in the API response

In `pages/companies.tsx`:

- show a warning banner if `trackerOnlyCompanies` is non-empty
- include:
  - count
  - sample IDs/names
  - note that Sync Database is required before these companies appear in the main list

**Expected result:**

- Users are alerted to out-of-sync Tracker rows.
- The main list remains Database-driven.

## Task 11: Make Deletion Audit Intent Explicit

**Files:**

- Modify: `pages/api/delete-company.ts`

**Problem:**
Deleting a company removes its live rows but leaves `Thread_History` and `Logs_DoNotEdit` entries behind. This is correct for audit purposes, but the intent is not documented.

**Relevant code:**

```106:131:pages/api/delete-company.ts
// 3. Remove from email schedule
try {
    await deleteEmailScheduleEntriesForCompanies([companyId]);
} catch (scheduleErr) {
    console.warn('Could not clear email schedule for deleted company:', scheduleErr);
}

// 4. Log to Thread_History and Logs_DoNotEdit, then cache
const timestamp = new Date().toISOString();
```

**Required change:**

- add comments documenting that logs/history are retained intentionally as immutable audit records
- review consumers of history and make sure they handle deleted company IDs gracefully

**Expected result:**

- This behavior is understood as intentional rather than as a data leak.

## Task 12: Centralize Environment Validation

**Files:**

- Create: `lib/env-check.ts`
- Modify: `lib/google-sheets.ts`
- Review: `lib/email-schedule.ts`, `lib/committee-members.ts`

**Problem:**
Environment checks are inconsistent and scattered. Different modules fail with different messages.

**Relevant code:**

```32:35:lib/email-schedule.ts
function getSpreadsheetId(): string {
    const id = process.env.SPREADSHEET_ID_2 || process.env.SPREADSHEET_ID_1 || process.env.SPREADSHEET_ID;
    if (!id) throw new Error('No SPREADSHEET_ID configured');
    return id;
}
```

**Required change:**

- add a single helper that validates the required env vars
- call it early in `lib/google-sheets.ts`
- keep per-module fallbacks only where they are intentional

**Expected result:**

- Misconfiguration fails fast with one clear error message.

## Task 13: Complete the Contact Row Schema in `add-contact`

**Files:**

- Modify: `pages/api/add-contact.ts`

**Problem:**
`/api/data` reads contact rows through column O (`activeMethods`), but `add-contact` only writes `A:N`.

**Relevant code:**

```55:76:pages/api/add-contact.ts
const newRow = [
    companyId,
    companyName || '',
    discipline || '',
    '', // Target Sponsorship Tier
    '', // Priority
    contact.name.trim(),
    contact.role?.trim() || '',
    contact.email?.trim() || '',
    contact.phone?.trim() || '',
    '', // Landline
    contact.linkedin?.trim() || '',
    '', // Reference
    contact.remark?.trim() || '',
    contact.isActive ? 'TRUE' : 'FALSE'
];

await sheets.spreadsheets.values.append({
    spreadsheetId: databaseSpreadsheetId,
    range: `${sheetName}!A:N`,
```

**Required change:**

- extend the row with column O
- write to `A:O`
- initialize `activeMethods` to `''`

**Expected result:**

- Newly added contacts match the schema expected by `/api/data`.

## Task 14: Put the New Tracker-Only Alert and ID Gap Preview Behind the Current Admin Surface

**Files:**

- Modify: current admin/settings entry points
- Review: `pages/settings.tsx`

**Problem:**
The old Data Management tab has already been removed from the Settings UI, but some of the operational/admin tooling described in this plan still needs a safe home.

**Required change:**

- decide on the new admin surface for:
  - tracker-only company alerts
  - ID gap preview
  - Superadmin-only renumbering preview/apply
- if these tools stay off the main Settings page, update links and banners to point to the replacement UI

**Expected result:**

- The planned safety checks remain accessible without reintroducing the removed Data Management tab.

## Testing Checklist

- Verify `/api/data` uses Database name first and still merges Tracker workflow fields correctly.
- Create a controlled ID gap in a test/staging sheet and verify preview/apply updates:
  - Database IDs
  - Tracker IDs
  - `Email_Schedule!A`
  - `Thread_History!B`
  - log rows with forward and reverse maps
- Run import previous responses and confirm the value appears in the UI immediately.
- Simulate a Database write failure after Tracker write and verify the warning/log path.
- Run email schedule migration in dry-run mode with duplicate names present and confirm ambiguous rows are not auto-fixed.
- Verify the Tracker-only warning banner appears when a Tracker row has no Database row.
- Add a contact and confirm column O exists/round-trips through `/api/data`.

## Rollout Order

Implement in this order to reduce risk:

1. Source-of-truth fixes: Task 1, Task 7, Task 12
2. Data safety fixes: Task 2, Task 3, Task 4
3. Visibility fixes: Task 10, Task 11, Task 14
4. Secondary data-path fixes: Task 5, Task 6, Task 13
5. Maintenance improvements: Task 8, Task 9

## Open Decisions

- Where should the new Superadmin-only renumber preview/apply UI live now that the old Data Management tab is removed?
- Should the email schedule migration script support a checked-in override file for ambiguous names, or should overrides stay CLI-only?
- Do we want a dedicated revert script for renumber operations, or is storing the reverse map in logs enough for now?

## Appendix: Relevant Existing Code References

### `/api/data` currently prefers Tracker company names

```129:148:pages/api/data.ts
const companyMap = new Map();
dbRows.forEach((row, index) => {
    const id = row[0];
    if (!id) return;
    if (!companyMap.has(id)) {
        const t = trackerMap.get(id);
        companyMap.set(id, {
            id,
            companyName: t?.companyName || row[1] || 'Unknown',
            contactStatus: t?.contactStatus || 'To Contact',
            relationshipStatus: t?.relationshipStatus || '',
            channel: t?.channel || '',
            urgencyScore: t?.urgencyScore || 0,
            pic: t?.assignedPic || 'Unassigned',
            followUpsCompleted: t?.followUpsCompleted || 0,
            sponsorshipTier: t?.sponsorshipTier || '',
```

### `id-gaps/fix` updates IDs but not schedule rows

```109:147:pages/api/id-gaps/fix.ts
await Promise.all([
    sheets.spreadsheets.values.update({
        spreadsheetId: databaseSpreadsheetId,
        range: `${dbSheetName}!A2:A${newDbRows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: newDbRows },
    }),
    sheets.spreadsheets.values.update({
        spreadsheetId: trackerSpreadsheetId,
        range: `${trackerSheetName}!A2:A${newTrackerRows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: newTrackerRows },
    })
]);

// 5. Update Thread_History so activity logs still match companies (column B = companyId)
```

### Import previous responses currently writes to the Database-side compiled list only

```101:140:pages/api/import/previous-responses.ts
const targetSheetName = targetMetadata.data.sheets?.find(s => s.properties?.title === '[AUTOMATION ONLY] Compiled Company List')?.properties?.title;

const targetResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: databaseSpreadsheetId,
    range: `${targetSheetName}!A2:E`,
});

batchUpdates.push({
    range: `${targetSheetName}!E${index + 2}`,
    values: [[previousResponse]]
});
```

### `add-contact` currently writes only through column N

```55:76:pages/api/add-contact.ts
const newRow = [
    companyId,
    companyName || '',
    discipline || '',
    '', // Target Sponsorship Tier
    '', // Priority
    contact.name.trim(),
    contact.role?.trim() || '',
    contact.email?.trim() || '',
    contact.phone?.trim() || '',
    '', // Landline
    contact.linkedin?.trim() || '',
    '', // Reference
    contact.remark?.trim() || '',
    contact.isActive ? 'TRUE' : 'FALSE'
];

await sheets.spreadsheets.values.append({
    spreadsheetId: databaseSpreadsheetId,
    range: `${sheetName}!A:N`,
```
