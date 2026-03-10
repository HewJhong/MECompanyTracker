# Allow Admin to Bulk-Unassign Companies Regardless of Status

**Goal:** Remove the frontend restriction that prevents admins from batch-unassigning companies with a status other than "To Contact".

**Architecture:** The restriction is purely a frontend guard in `pages/companies.tsx`. Removing the guard will allow the existing bulk-assign API (`/api/bulk-assign`) to handle unassignment for companies of any status.

---

## Proposed Changes

### Frontend

#### [MODIFY] [COMPLETED] [companies.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company Tracker/outreach-tracker/pages/companies.tsx)

Remove the status validation block inside `handleBulkAssign` (lines 185–198): [x]

```diff
-        // Validation for Unassignment
-        if (assignee === '__UNASSIGN__') {
-            const invalidCompanies = Array.from(selectedCompanies).filter(id => {
-                const company = data.find(c => c.id === id);
-                return company && company.status !== 'To Contact';
-            });
-
-            if (invalidCompanies.length > 0) {
-                showError(
-                    "Action Restricted",
-                    "Unassignment is only allowed for companies with 'To Contact' status.\n\nFor other statuses, please reassign to a new PIC."
-                );
-                setSelectedAssignee(''); // Reset dropdown
-                return;
-            }
-        }
```

No other files need to be changed.

---

## Verification Plan

### Manual Verification

1. Open the app at `http://localhost:3000/companies`.
2. Select one or more companies that have a status **other than** "To Contact" (e.g., "Contacted", "Interested").
3. In the bulk action bar at the bottom, choose **"Unassign (Clear PIC)"** from the assignee dropdown and click **Assign**.
4. ✅ Expected: A confirmation modal appears (no "Action Restricted" error).
5. Confirm the unassignment.
6. ✅ Expected: The selected companies' PIC column is cleared (shows "Unassigned"), with no errors.
