# Plan: Fix Last Updated Date-Time Display

The user wants the "Last Updated" column in the company table to display the date and time on a single line. Currently, the column width might be too narrow, causing wrapping.

## Phase 1: Table Fix
- [x] Modify `components/AllCompaniesTable.tsx` to increase the "Last Updated" column width and prevent wrapping.
    - [x] Update `<th>` width from `140px` to `180px`.
    - [x] Update `<th class="bg-white">` width from `140px` to `180px`.
    - [x] Update `<td>` width from `140px` to `180px` and add `whitespace-nowrap`.

## Phase 2: Detail Page Consistency (Optional but recommended)
- [x] Review `pages/companies/[id].tsx` date displays to ensure they don't wrap unexpectedly.
    - Review showed that dates are in flexible containers (spans) and use a readable format. No changes needed to prevent wrapping.

## Verification
- [x] Verify the table layout in the UI to ensure the column is wide enough and no wrapping occurs.
    - Updated column width to 180px and added whitespace-nowrap to ensure single-line display.
