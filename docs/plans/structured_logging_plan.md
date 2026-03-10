# Implementation Plan: Structured History Logging & Accurate Analytics

## Goal Description
Currently, the Analytics trend graph relies on keyword searching within free-text remarks, which is fragile and inaccurate. I will introduce a structured `Action Type` column to the `Thread_History` sheet. This will allow the system to explicitly categorize events (e.g., "Outreach", "Status Change", "Contact Added") and ensure the analytics graphs are 100% accurate.

## Proposed Changes

### Google Sheets Schema Update
#### [MODIFY] `pages/api/sync-database.ts`
- Update `ensureRequiredSheets` to add a 5th column to `Thread_History`: `Action Type`.
- The new headers will be: `['Date', 'Company ID', 'User', 'Remark', 'Action Type']`.

### API Handler Updates
#### [MODIFY] `pages/api/update.ts`, `pages/api/add-contact.ts`, `pages/api/update-contact.ts`, etc.
- Update all calls to `append` to `Thread_History` to include the `Action Type` as the 5th value.
- **Action Types to include:**
  - `OUTREACH`: For manual outreach logs.
  - `STATUS_CHANGE`: When the status is updated (e.g., To Contact → Contacted).
  - `CONTACT_CHANGE`: When contacts are added/updated.
  - `GENERAL_UPDATE`: For other information updates.

### Data Processing & Analytics Updates
#### [MODIFY] `pages/api/data.ts`
- Update the history mapping logic to read the 5th column (`row[4]`) as `actionType`.

#### [MODIFY] `pages/analytics.tsx`
- Update the trend graph logic to filter by `actionType === 'OUTREACH'` or specific status transitions detected in the `remark` (but confirmed by the `STATUS_CHANGE` type).

## Verification Plan

### Automated/Infrastructure Verification
1. Run the `sync-database` API once to trigger the header update in Google Sheets.
2. Manually check the Google Sheet to confirm the `Action Type` column exists.

### Manual Verification
1. Perform an outreach action on a company. Check the `Thread_History` sheet to see if the `Action Type` is recorded as `OUTREACH`.
2. Change a company status. Verify the log shows `STATUS_CHANGE`.
3. Open the Analytics page and verify the graphs work correctly using these new explicit types.
4. Verify that the graph is now "flat" for companies with no actual outreach/status change events.
