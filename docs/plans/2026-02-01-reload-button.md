# Goal: Add Reload Button to All Companies Page

The user wants a way to manually fetch the latest data from the Google Spreadsheet to ensure the web app is in sync with any manual sheet edits.

## User Review Required
> [!NOTE]
> The reload button will bypass the server-side cache for that specific request, ensuring fresh data.

## Proposed Changes

### Backend API
#### [MODIFY] [data.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/data.ts)
- Add logic to check for `req.query.refresh === 'true'`.
- If true, bypass the `cache.get()` check.

### Frontend Components
#### [MODIFY] [companies.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies.tsx)
- Add `isRefreshing` state to manage button loading state.
- Update `fetchData` to support a `forceRefresh` parameter.
- Add a "Reload Data" button in the header section using `ArrowPathIcon`.

## Verification Plan
### Manual Verification
1. Open the "All Companies" page.
2. Click the "Reload" button.
3. Verify that a loading state is shown on the button.
4. Verify that data is refreshed (can test by changing a cell in the sheet manually).
