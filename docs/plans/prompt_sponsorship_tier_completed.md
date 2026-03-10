# Plan: Prompt Sponsorship Tier for Completed Status

This plan outlines the changes required to prompt the user for a sponsorship tier when a company's status is set to "Completed" on the company details page.

## Proposed Changes

### 1. Frontend: Company Detail Page (`pages/companies/[id].tsx`)

- Update the visibility condition for the Sponsorship Tier dropdown to include the 'Completed' status.
- Add validation to ensure a tier is selected when the status is set to 'Completed'.
- Update the `handleSave` logic to include the sponsorship tier for 'Completed' status updates.

### 2. Backend: API (`pages/api/update.ts`)
- No changes needed if the field is already mapped (which it seems to be in `TRACKER_MAP`).

## Implementation Tasks

### Phase 1: Frontend Updates
- [x] Modify `pages/companies/[id].tsx` to show the sponsorship tier dropdown when status is 'Completed'.
- [x] Update `handleSave` to include sponsorship tier for 'Completed' status.
- [x] Add validation in `handleSave` to prevent saving 'Completed' status without a sponsorship tier.

## Success Criteria
- When a user selects "Completed" from the status dropdown, the "Sponsorship Tier" selection appears.
- The user must select a tier before they can save the status as "Completed".
- The selected sponsorship tier is correctly saved to the Outreach Tracker sheet.
