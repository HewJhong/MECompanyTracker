# Implementation Plan: Fix "Deleting Last Contact Removes Company" Bug

## Summary of the Bug
When the user deletes a contact, `delete-contact.ts` currently deletes the entire row in the Google Sheets database (the `[AUTOMATION ONLY]` sheet). Since the backend (`data.ts`) builds the list of companies based strictly on the rows present in this sheet, deleting the *only* row for a company causes the company to completely disappear from the frontend (`dbRows` does not contain the `companyId` anymore, causing the tracker row to be ignored).

## Proposed Changes

### [x] 1. Update `pages/api/delete-contact.ts`
Modify the API to check if the contact being deleted is the last (or only) row for the company in the database.
- Fetch column A (`A:A`) to count how many rows exist for the given `companyId`.
- **If `count > 1`**: It's safe to delete the row using the existing `batchUpdate` `deleteDimension` logic.
- **If `count === 1`**: We **must not delete** the row. Instead, we perform a `sheets.spreadsheets.values.update` to replace contact-specific columns (from `F` to `P`, i.e., Name, Role, Email, Phone, Landline, LinkedIn, Reference, Remark, Is Active, Active Methods) with empty values (and `'FALSE'` for `Is_Active`). This preserves the company's base information in columns A through E (Company ID, Name, Discipline, Tier, Priority) so the company remains visible.

### [x] 2. Update `pages/api/data.ts`
When parsing the `dbRows` to build the `companyMap`, we need to prevent "blank" contacts from being added to a company's contact list.
- Add a condition before pushing to `c.contacts` in `data.ts`:
  ```typescript
  // Check if there is any meaningful contact information
  const hasContactInfo = (row[5] && row[5].trim()) || (row[7] && row[7].trim()) || (row[8] && row[8].trim()) || (row[10] && row[10].trim());
  if (hasContactInfo) {
      c.contacts.push({ ... });
  }
  ```
- This ensures that if the only row for a company is the "base" row with cleared contact fields, the frontend will cleanly display 0 contacts rather than an empty contact card.

## Verification Plan

### Manual Verification
1. Add a new test company (e.g., "Delete Test Corp").
2. Go to the company details page.
3. Add a new contact to it.
4. Delete the newly added contact (which is the only contact).
5. **Verify**: The company should **not** disappear from the system. It should still be accessible on the "All Companies" table.
6. **Verify**: The company details page should now show `0 contacts` and no empty contact cards.
7. Add two contacts to the company, and delete one of them.
8. **Verify**: Only the deleted contact is removed, the other contact remains, and the row deletion works normally for multiple-row companies.

## Implementation Notes
- The range fetch in `delete-contact.ts` was extended from `A:N` to `A:O` to correctly include the `activeMethods` column (col O, index 14) when reading the row before clearing.
- The `F:P` clear range covers 11 columns: Name (F), Role (G), Email (H), Phone (I), Landline (J), LinkedIn (K), col L (unused/reference), Remark (M), Is_Active (N), Active Methods (O), and one extra (P) as a buffer. `Is_Active` is explicitly set to `'FALSE'` (position 8 in the 0-indexed array passed: `['', '', '', '', '', '', '', '', 'FALSE', '', '']`).
- The `hasContactInfo` guard in `data.ts` checks name, email, phone, and linkedin — the most essential fields. A contact with only a role or remark filled in is also treated as blank. This is a conservative but reasonable heuristic.

