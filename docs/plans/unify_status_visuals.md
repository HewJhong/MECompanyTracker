# Plan: Unify Status Visuals in Company Detail Page

This plan outlines the changes to ensure that "Rejected" status is visually consistent with "Completed" status in the company detail header.

## Proposed Changes

### [Component] Pages

####- [x] [id.tsx](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/outreach-tracker/pages/companies/%5Bid%5D.tsx)
    - [x] Import `XCircleIcon` from `@heroicons/react/24/solid`.
    - [x] Add logic to display `XCircleIcon` beside the company name when the status is "Rejected", mirroring the behavior for "Completed".

---

## Verification Plan

### Automated Tests
- No automated tests planned for this UI change.

### Manual Verification
1.  **Check Completed Status**: Open a company, set status to `Completed`, and verify the green tick icon appears beside the name.
2.  **Check Rejected Status**: Change the status to `Rejected` (with remark) and verify a red circle-x icon appears beside the name in the same position.
3.  **Consistency Check**: Ensure the spacing and size of icons are identical for both statuses.
