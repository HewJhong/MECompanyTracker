# Implementation Plan: Fix Save Bug for Target Sponsorship Tier

## Summary of the Bug
When a user updates the "Target Sponsorship Tier" on the company details page, the UI shows a successful save, but the data is not written to the Google Sheet. 

**Root Cause:**
The frontend `pages/companies/[id].tsx` sends the update payload with the key `targetSponsorshipTier`. 
However, in the backend `pages/api/update.ts`, the `DB_MAP` that maps payload keys to spreadsheet columns uses the outdated key `'priority'` for column `'D'`. Because the key `'targetSponsorshipTier'` is not found in `DB_MAP`, the backend silently ignores this field when constructing the sheet updates.

## Proposed Changes

### [x] 1. Update `pages/api/update.ts`
Modify the `DB_MAP` object to correctly map the `targetSponsorshipTier` key from the frontend to column `D` in the database sheet.

```diff
         const DB_MAP: Record<string, string> = {
             'companyName': 'B',
             'discipline': 'C',
-            'priority': 'D'
+            'targetSponsorshipTier': 'D'
         };
```

## Verification Plan

### Manual Verification
1. Open the application locally and navigate to to a company details page (e.g., `http://localhost:3000/companies/SomeCompanyId`).
2. Change the **Target Sponsorship Tier** dropdown to a different value.
3. Click **Update Status** to save the changes.
4. Refresh the page to verify the new value persists.
5. (Optional) Check the Google Sheet `[AUTOMATION ONLY]` to verify that column `D` for the company has been updated to the new value.

## Implementation Notes
- Changed `'priority'` to `'targetSponsorshipTier'` in the `DB_MAP` variable in `pages/api/update.ts` to seamlessly map changes from the frontend to column `D` (`targetSponsorshipTier` maps to `D`).
- This change ensures that any modification to a company's target sponsorship tier propagates successfully without error.
