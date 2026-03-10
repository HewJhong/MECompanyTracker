# Implementation Plan: Daily Stats Tracking Sheet

## Goal Description
The current analytics graph relies on parsing the `Thread_History` logs to determine daily numbers. This is inaccurate because it fails to properly account for backwards status transitions (e.g., reverting a company from "Contacted" back to "To Contact").
To fix this, we will introduce a new `Daily_Stats` sheet in the Outreach Tracker Google Spreadsheet. The system will automatically recount the current statuses of all companies and update this sheet with a daily snapshot, giving us perfectly accurate numbers over time.

## Proposed Changes

### 1. New Utility Function
#### [NEW] `lib/daily-stats.ts`
- Create a reusable function `syncDailyStats(sheets, spreadsheetId)`.
- **Logic**:
  1. Fetch only the `Status` column (`C:C`) from the `Outreach Tracker` sheet (extremely fast).
  2. Count the occurrences of each status (`To Contact`, `Contacted`, `Interested`, `Registered`, `No Reply`, `Rejected`).
  3. Ensure the `Daily_Stats` sheet exists (create it with headers if it doesn't).
  4. Look for today's local date (`YYYY-MM-DD`) in `Daily_Stats`.
  5. If today's row exists, overwrite it. If not, append a new row.

### 2. Triggering the Sync
We will trigger this function whenever company statuses have the potential to change.
#### [MODIFY] `pages/api/update.ts`
- Import and call `await syncDailyStats(sheets, spreadsheetId2)` right before returning the successful response.
#### [MODIFY] `pages/api/add-company.ts`
- Import and call `await syncDailyStats` after adding a company.
#### [MODIFY] `pages/api/sync-database.ts`
- Import and call `await syncDailyStats` at the end of the script so manual imports/syncs also yield an accurate snapshot.

### 3. Updating the Analytics Graph
#### [MODIFY] `pages/analytics.tsx`
- We will no longer parse `history` to calculate `timeline`.
- We will use the data fetched from the `Daily_Stats` sheet (via `data.ts`) to populate the graph directly.
#### [MODIFY] `pages/api/data.ts`
- Fetch the `Daily_Stats` sheet alongside the other data.
- Return `dailyStats` in the JSON response payload.

---

## Verification Plan

### Manual Verification
1. I will run a script to manually trigger the `syncDailyStats` function to initialize the sheet and populate today's data.
2. Open the "Analytics" page and verify the graph reads the values directly from the API output (instead of history).
3. Switch a company's status from "To Contact" to "Contacted", and verify the graph instantly reflects (+1 Contacted).
4. **Crucial Backward Test**: Switch the same company *back* to "To Contact" and verify the graph accurately decrements the "Contacted" count, proving the new approach works flawlessly.
