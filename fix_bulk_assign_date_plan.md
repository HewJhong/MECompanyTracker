# Fix Last Updated Date in Bulk Assign

## Goal Description
The "All Companies" list shows an incorrect update time (reported as "Jan 1, 1000") after a bulk assignment. This happens because the bulk assignment API (`pages/api/bulk-assign.ts`) updates the "Assigned PIC" column but fails to update the "Last Updated" column in the Google Sheet. On page refresh, the application fetches the old (or default/invalid) date from the sheet.

This plan focuses on modifying `pages/api/bulk-assign.ts` to ensure the "Last Updated" column is updated with the current timestamp whenever a bulk assignment occurs.

## User Review Required
> [!NOTE]
> This fix assumes the "Jan 1, 1000" value comes from the existing state of the Google Sheet (e.g., a default value or previous bad data). By overwriting it with the current timestamp, we fix the display for any company that gets updated.

## Proposed Changes

### Backend API
#### [MODIFY] [pages/api/bulk-assign.ts](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/outreach-tracker/pages/api/bulk-assign.ts) [COMPLETED]
- Update the logic to find the column index for "Last Updated" (or "Last Update") in addition to "Assigned PIC". [COMPLETED]
- Generate a current ISO timestamp. [COMPLETED]
- In the loop where we create update requests for "Assigned PIC", add a corresponding update for the "Last Updated" column for the same row. [COMPLETED]
- Ensure both updates are included in the `batchUpdate` call. [COMPLETED]

## Verification Plan

### Automated Tests
- None available for this specific API integration with Google Sheets.

### Manual Verification
1.  **Pre-requisite**: Identify a company in the "All Companies" list. Note its current "Last Updated" time.
2.  **Action**: Select the company and use the "Assign" button to change its assignee (e.g., to yourself or Unassign).
3.  **Observation (Optimistic)**: The UI should immediately show "Just now" or the current time in "Last Updated".
4.  **Action**: Refresh the page.
5.  **Observation (Server Data)**: The "Last Updated" time should **remain** at the current time (e.g., "Oct 27, 2023, 10:00") and NOT revert to "Jan 1, 1000" or an old date.
