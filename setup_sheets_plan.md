# Implementation Plan: Automatic Sheet Setup for Synchronize Database

This plan outlines the changes required to automatically set up missing sheets and headers in the Outreach Tracker spreadsheet when the "Synchronize Database" feature is triggered.

## Proposed Changes

### [Component Name] API Layer

#### [MODIFY] [sync-database.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/sync-database.ts)

- [x] Add a new function `ensureRequiredSheets(sheets, spreadsheetId)` to verify and create missing sheets and headers.
- [x] Call this function at the beginning of the `handler`.
- [x] Define the required sheet structure:
    - **Main Sheet** (1st sheet): Headers A-M (`ID`, `Name`, `Status`, `Channel`, `Urgency`, `Prev Response`, `PIC`, `Last Company Contact Date`, `Last Committee Contact Date`, `Follow-ups`, `Sponsorship Tier`, `Remarks`, `Last Update`).
    - **Logs_DoNotEdit**: Headers A-E (`Timestamp`, `User`, `Action`, `Details`, `Data`).
    - **Thread_History**: Headers A-D (`Date`, `Company ID`, `User`, `Remark`).

## Implementation Notes

Automatic sheet setup is triggered at the beginning of the sync process, but only if `preview` is false. This ensures that the system is ready to receive data before synchronization begins.

## Verification Plan

### Manual Verification

1.  **Empty Spreadsheet Test**:
    - Create a new Google Spreadsheet and set it as `SPREADSHEET_ID_2` in `.env.local`.
    - Trigger the Synchronize Database feature.
    - Verify that the three sheets are created with correct headers.
    - Verify that the synchronization completes successfully.

2.  **Missing Sheet Test**:
    - Delete one of the required sheets (e.g., `Thread_History`) from an existing tracker spreadsheet.
    - Trigger the Synchronize Database feature.
    - Verify that the missing sheet is recreated with correct headers.

3.  **Missing Headers Test**:
    - Clear the headers of the main sheet.
    - Trigger the Synchronize Database feature.
    - Verify that the headers are restored.

### Automated Verification Script

I will create a temporary verification script `scripts/verify-sheet-setup.ts` (or similar) to check the spreadsheet structure.

```bash
npx ts-node scripts/verify-sheet-setup.ts
```

This script will verify:
- Presence of all required sheets.
- Correctness of headers in each sheet.

### Automated Tests
- No existing automated tests were found for sheet synchronization.
