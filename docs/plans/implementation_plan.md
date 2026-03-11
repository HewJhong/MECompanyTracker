# Implementation Plan: Contact PIC Tracking

## Overview
Currently, the tracker assigns a Committee Member as the PIC for a company, but it doesn't clearly track *which specific contact person* from that company is being communicated with. We need to introduce a "Currently Contacting" concept to the UI and backing Google Sheet.

## Requirements
- Allow users to mark one specific Contact within a Company's "Contacts" list as the one currently being communicated with.
- Store this selection persistently so it remains visible across reloads.
- Display this explicitly on the Company Details page to prevent confusion and duplicate outreach.

## Architecture Changes
- The `[AUTOMATION ONLY]` Google Sheet already has Column N (Index 13) indicating `Is Active` (Boolean). This translates directly to `isActive` in our `Contact` model.
- **Key Change**: Move the "Mark as Active / Primary Contact" action *outside* of the edit modal.
- Add an explicit "Set as Primary" button (and a prominent "★ PRIMARY" badge) directly on the contact card in `pages/companies/[id].tsx`, so users can switch the primary contact with a single click without opening the edit dialog.
- When a user sets a new primary contact, the API should ideally ensure any other contacts for that company are unset (if we only want one primary contact), or at least toggle the clicked contact's status directly.
- **Committee Workspace**: In `pages/committee.tsx`, the `contact` field is currently derived from `company.contacts?.[0]?.picName || ''` (or `name`). We will update this so that the `contact` field picks up the *active* contact first, falling back to the first contact if none are active. This ensures the "Full" view in the Committee Workspace accurately displays the specific person the committee member is talking to.

## UI Design Proposal (ASCII)

```text
+-------------------------------------------------------------+
| Contacts (3)                                  [+ Add New]   |
+-------------------------------------------------------------+
|                                                             |
|  [★] MARKED AS PRIMARY CONTACT                [Edit] [Del]  |
|  John Doe - Marketing Director                              |
|  j.doe@example.com | 555-0123                               |
|                                                             |
+-------------------------------------------------------------+
|                                                             |
|  [ ] Set as Primary Contact                   [Edit] [Del]  |
|  Jane Smith - HR Manager                                    |
|  j.smith@example.com | 555-0987                             |
|                                                             |
+-------------------------------------------------------------+
```

**Committee Workspace "Full" Card View (`components/committee-workspace.tsx`)**:
```text
+-------------------------------------------------------------+
| ACME Corp                                                [P]| <- [P] is the Red Flag icon (isFlagged)
| Jane Smith - Manager · 2d ago                               | <- Shows Active PIC (only active shown)
|                                                     [Stale] |
+-------------------------------------------------------------+
```
## Implementation Steps

### Phase 1: Expose `isActive` natively in the UI
1. **[x] Update `pages/companies/[id].tsx` (Contact Card UI)**
   - Action: In the `renderContacts` section, add a Star icon or a specific badge and button allowing users to toggle a contact's `isActive` state. If one contact is set to active, the previously active one should ideally be unset (or we can allow multiple, but typically "Currently Contacting" implies a primary).
   - Why: Makes the functionality visible.
   - Risk: Low

2. **[x] Update API Endpoint & Optimistic Updates**
   - Action: The `handleUpdateContact` and `handleContactAction` functions already send `isActive: newContact.isActive`. We just need to make sure the "Set as Primary" button cleanly updates this field via `handleUpdateContact`.
   - Action: If we want to enforce *only one* active contact, we might need a specific new endpoint like `/api/set-primary-contact` that sets the target contact `isActive` to TRUE and all other contacts for that company to FALSE in the DB, then fetches the updated list.

## Phase 2: Data Migration (Google Sheets Sync)
**Problem:** The Google Sheet currently signifies active contacts via cell highlights (e.g. green background) on their name, phone, or email instead of a dedicated data column. These highlights are not yet synced to our new `activeMethods` column.
**Proposed Solution:**
1. **Migration Script (`scripts/sync-highlights.ts`):** 
   - Write a one-off script to read the `[AUTOMATION ONLY]` sheet, including `userEnteredFormat.backgroundColor` for Columns F (Name), H (Email), and I (Phone).
   - If H is highlighted, add `email` to the active methods list. If I is highlighted, add `phone`. If F is highlighted (but no specific method), we may default to just marking the contact as `isActive` or assume all available methods.
   - Write the resulting comma-separated string back to Column O (Index 14) for all contacts.
2. **Conditional Formatting:** Add a rule in Google Sheets so that if Column O contains `email`, the email cell highlights green; if it contains `phone`, the phone cell highlights; and if *any* method is active (Column N is TRUE), the Contact Name cell highlights.

## Phase 3: Granular Contact Methods (Phone vs Email)

**Problem:** A PIC might only be responsive on a specific channel (e.g., WhatsApp/Phone but not Email). The current "Currently Contacting" status applies to the whole person, lacking granularity.

**Proposed Solution:**
1. **Google Sheets Storage:** Use the newly populated Column O to store and read the comma-separated string of active channels (e.g., `phone`, `email`, or `phone,email`).
2. **API Updates:** 
   - Update `api/data.ts` to parse `row[14]` as `activeMethods` (array of strings).
   - Update `api/set-primary-contact.ts` to accept an `activeMethods` array and save it back to Column O as a joined string.
3. **UI Updates (`[id].tsx`):**
   - Instead of a single "Currently Contacting" button for the whole contact, embed small toggle buttons (e.g., a star or pin icon) directly next to the **Phone**, **Email**, and **LinkedIn** fields on the contact card.
   - When clicked, it toggles that specific method into the `activeMethods` array.
   - The overall contact `isActive` (Column N) can automatically turn `TRUE` if any method is active, and `FALSE` if none are.
4. **Committee Workspace (`committee.tsx`):**
   - Update the display to show the contact name *alongside* an icon indicating the active channel (e.g., 📱 for Phone, ✉️ for Email). Example: `Jane Smith 📱✉️`.

## Add Limits Settings (New Request)

**Goal:** Add a new page in the settings page to setup limits. The limits include the number of companies by their sponsorship tiers that we can accommodate in total and per day. We can place the information in a new tab in the outreach tracker spreadsheet.

**Action Plan:**
1. **Backend API (`api/limits/index.ts`):**
   - Implement GET method to read from the "Limits" sheet in the tracker spreadsheet (`process.env.SPREADSHEET_ID_2`).
   - Implement POST method to save the updated limits to the "Limits" sheet. If the sheet doesn't exist, handle it gracefully (create it or prompt the user, preferable use the API to add the sheet if it's missing).
2. **Settings UI (`settings.tsx`):**
   - [x] Add a new "Limits" tab in the Settings sidebar.
   - [x] Build a UI to render number inputs for Total and Daily limits per sponsorship tier (`priorityOptions` from `lib/priority-mapping.ts`).
   - [x] Wire up fetch and save methods.

### UI Design Proposal (ASCII)

```text
+-------------------------------------------------------------------------+
| Data Management                                                         |
|                                                                         |
| Sponsorship Limits                                                      |
| Set maximum capacities for total and daily companies accommodated       |
| by tier.                                                                |
|                                                                         |
| Tier                      Total Limit             Daily Limit           |
| ----------------------------------------------------------------------- |
| Official Partner          [   5 ]                 [   1 ]               |
|                                                                         |
| Gold Sponsorship          [  10 ]                 [   2 ]               |
|                                                                         |
| Silver Sponsorship        [  15 ]                 [   3 ]               |
|                                                                         |
| Bronze Sponsorship        [  20 ]                 [   5 ]               |
|                                                                         |
|                           [ Save Limits ]                               |
+-------------------------------------------------------------------------+
```

## Navigation Enhancements (New Request)

**Goal:** 
1. If a user navigates to a company details page from the Committee Workspace, the "Back" button should return them to the Committee Workspace.
2. If a user navigates from the All Companies list, the "Back" button should return them to the All Companies list.
3. When returning to the All Companies list, previous search queries and filters should be preserved.

**Action Plan:**
1. **State Preservation for Filters (`pages/companies.tsx`)**:
   - [x] Use `sessionStorage` (or URL query parameters) to store the filter state (`columnFilters`, `sortField`, `sortDirection`) whenever they change.
   - [x] On component mount, initialize the state from `sessionStorage` if available.
2. **Back Navigation Detection (`pages/companies/[id].tsx`)**:
   - [x] The current generic `router.push('/companies')` or `router.back()` might be flawed if the user arrived directly via URL.
   - [x] We will use an internal state or `sessionStorage` to track the `previousRoute`.
   - [x] Alternatively, a cleaner Next.js approach is to pass a `?from=committee` or `?from=all` query parameter when clicking a company card in the respective views.
3. **Execution Steps**:
   - [x] Modify `pages/committee.tsx`: Update `handleCompanyClick` to push `/companies/[id]?from=committee`.
   - [x] Modify `pages/companies.tsx`: Update `handleCompanyClick` to push `/companies/[id]?from=all`.
   - [x] Modify `pages/companies.tsx`: Add `useEffect` to save and load `columnFilters` to/from `sessionStorage`.
   - [x] Modify `pages/companies/[id].tsx`: Read `router.query.from`. If it's `'committee'`, the Back button goes to `/committee`. If `'all'`, it goes to `/companies`. Default to `/companies`.

## Testing Strategy
- Manual verification for Limits: UI form works, API saves to Sheets, UI reloads correctly.
- Manual verification for Navigation: Click from Committee -> Back goes to Committee. Click from All Companies with a filter -> Back goes to All Companies and the filter is still there.

## User Review Required
- Please review if using `sessionStorage` to keep the filter state around on the All Companies page is acceptable. This means if you leave the page and come back later in the same tab, the filters will still be active. We could also just hold it in a React Context if we want it to survive across the whole session even across tabs. `sessionStorage` is usually the standard for this.
