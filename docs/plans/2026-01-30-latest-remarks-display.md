# Display Latest Remark in Dedicated Area

## Problem Description

Currently, users cannot see the latest company-wide remark unless they switch to the "History" tab. We want to provide this context directly in the "Details" tab where they update status and add new remarks, so they have the most recent context immediately visible.

Instead of pre-filling the "Add Remark" text box (which could lead to accidental overwrite or confusion), we will add a dedicated, read-only "Latest Remark" display area.

## Proposed Changes

### [Backend] [data.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/data.ts)

**Changes Needed:**
- Extract Column M (index 12) from the first row of each company and include it in the top-level company object returned by the API.

```typescript
// Inside company grouping loop:
if (!companyMap.has(companyName)) {
    companyMap.set(companyName, {
        // ... existing fields
        remark: row[12] || '', // Extract from Column M
    });
}
```

---

### [Frontend] [id.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/%5Bid%5D.tsx)

**Changes Needed:**
1. Update `Company` interface to include `remark: string`.
2. Add a new UI section in the "Details" tab to display `company.remark`.

**UI Mockup:**
```tsx
{/* Latest Remark Display */}
{company.remark && (
    <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Latest Remark</label>
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 italic">
            "{company.remark}"
        </div>
    </div>
)}

{/* "Add Remark" textarea remains exactly as is for NEW remarks */}
```

## Verification Plan

### Manual Verification
1. **Prepare Data**: Ensure the Google Sheet has a remark in Column M for a test company.
2. **View Company**: Navigate to the company detail page.
3. **Verify Display**:
   - Confirm a "Latest Remark" box appears above the "Add Remark" section.
   - Confirm it matches the text in Column M of the spreadsheet.
4. **Update Remark**:
   - Add a *new* remark in the "Add Remark" textarea.
   - Save the changes.
   - Verify the "Latest Remark" area updates to show the new text (after refresh/re-fetch).

### Success Criteria
- ✅ Latest remark from Column M is displayed in a dedicated read-only area.
- ✅ Existing "Add Remark" functionality remains unchanged and creates new log entries.
- ✅ UI feels premium and consistent with the existing theme.

## Implementation Notes

- **Backend**: Updated `/api/data.ts` to extract the remark from column M (index 12) of the first row when grouping companies.
- **Frontend**: Updated `Company` interface in `pages/companies/[id].tsx` and added a conditional rendering block for the `Latest Remark` label and read-only text area.
- **Design**: Used `bg-slate-50` and `italic` text to distinguish the latest remark from editable fields.
