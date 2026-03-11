# Update Company Page Plan

## Update Company Page
Implementation:
1. [x] Move the pencil icon for editing company details to beside the company name, no need to have the text "Edit Company Details"

## Log Follow-Up
Context:
1. For each company, we will try to outreach to them and follow up with them three times.
2. If there are no replies from them, then we will mark it as "no reply" and won't continue to follow up with them
3. Exception: When we get new contacts for a company, then we will try to follow up with the new contact again. A similar logic will apply, we will only follow up with them three times.

Implementation:
1. [x] The log follow-up buttons should be available once we have sent the first outreach email to the company
2. [x] At first, the button will show log outreach. Subsequently, it will show log follow-up.
3. [x] The number of follow ups should be shown in the title bar of the update company page.
4. [x] The log follow-up button should be available even when there are no remarks added.

## Status
Context:
1. The status indicates the status of the company.
2. The possible statuses are "Completed", "Interested", "Negotiating", "Rejected", and "No Reply".

Implementation:
1. [x] For "Completed", it will mark the company with a green tick.
2. [x] For "Interested", it should prompt the user to update the sponsorship tier that the company is interested in.
3. [x] For "Rejected", it should prompt the user to update the reason for rejection.
4. For "No Reply", it should be automatically apply under these conditions: 
    1. The default status is "No Reply".
    2. The company has not replied after follow-up for three times. The company will then not show up in the Kanban task list of the assigned committee member.

Note:
1. We suppose that all updates of the company should be done by either the email automation backend or the committee member. 
2. Even after the company is marked as completed, the committee member should still be able to update the company and shall update the remarks accordingly.

## Remarks
Context:
1. When an email from a company is received, the email automation or the committee member should update the remarks accordingly.
2. There are some instances where the committee member updates the email late, therefore we should provide a date-picker for the committee to select the date where the company has responded. It should be placed as higher priority if the number of days from the last response from the company is longer than 3 days ago.
3. Committees can also log the remarks about their reply to the company.

Implementation:
1. [x] When the remarks are upated successfully, it should show a success box at the top of the page to indicate to the user.

## Edit Contacts Page
Implementation:
1. When editing a user, it should show a pop-up model.
2. An issue is that the Google Sheets does not have the column to record the role of the company representative, so it will not update correctly. We will need to add that column.
3. The remarks updated for the company are showing for all company representatives. The company remarks should be distinct from the contact-specific remarks.
4. The user should have the option to delete a contact.
5. Another important feature is to mark the contact as active, which indicates the representative that will response to our emails.



# Implementation Plan: Company Page Improvements

## Overview

This plan addresses the company page improvements outlined in `update_company_plan.md`, incorporating user clarifications on schema design, status automation, and contact management. The major change is migrating from a single-sheet to a **two-sheet architecture** for better data separation and scalability.

## User Review Required

> [!WARNING]
> **Schema Migration Required**
> This implementation requires migrating from the current single-sheet architecture to a two-sheet system. Existing data will need to be restructured. Please confirm the migration approach before proceeding.

> [!IMPORTANT]
> **Breaking Changes**
> - Company ID system (ME-0001 format) will be introduced
> - Highlighting-based active contact marking requires frontend implementation
> - Automatic status transitions will modify data without user intervention

## Architecture Changes

### Two-Sheet Design

#### Sheet 1: `Company_Database`
**Purpose:** Store static company and contact information

| Column | Field | Description |
|--------|-------|-------------|
| A | Company_ID | Unique identifier (e.g., ME-0001) |
| B | Company_Name | Legal company name |
| C | Discipline | Engineering discipline |
| D | Priority | High, Medium, Low |
| E | Contact_Name | Contact person name |
| F | Contact_Role | Job title/role (NEW) |
| G | Contact_Email | Email address |
| H | Contact_Phone | Phone number |
| I | Contact_LinkedIn | LinkedIn profile URL |
| J | Contact_Remarks | Contact-specific notes (NEW) |
| K | Is_Active_Contact | TRUE/FALSE for highlighting (NEW) |

**Notes:**
- One row per contact, multiple rows per company
- `Company_ID` links to Outreach Progress sheet
- `Is_Active_Contact` can be TRUE for multiple contacts per company

#### Sheet 2: `Outreach_Progress`
**Purpose:** Track outreach status, follow-ups, and remarks

| Column | Field | Description |
|--------|-------|-------------|
| A | Company_ID | Foreign key to Company_Database |
| B | Status | To Contact, Contacted, Negotiating, Interested, Completed, Rejected, No Reply |
| C | Sponsorship_Tier | Official Partners, Gold, Silver, Bronze (NEW) |
| D | Assigned_PIC | Committee member name |
| E | Follow_Ups_Completed | Integer count |
| F | Last_Committee_Update | Timestamp of last committee action |
| G | Last_Company_Activity | Timestamp of last company response |
| H | Company_Remarks | Latest company-level remark |
| I | Is_Flagged | TRUE/FALSE |
| J | Created_At | Initial creation timestamp |

**Notes:**
- One row per company
- Join on `Company_ID` to get full company details

#### Sheet 3: `Thread_History`
**Purpose:** Audit trail (existing, no changes needed)

| Column | Field |
|--------|-------|
| A | Timestamp |
| B | Company_ID (updated from Company_Name) |
| C | User |
| D | Action/Remark |

---

## Proposed Changes

### Backend API Updates

#### [MODIFY] [google-sheets.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/lib/google-sheets.ts)

**Changes:**
- No changes needed; authentication logic remains the same

---

#### [MODIFY] [data.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/data.ts)

**Changes:**
- Fetch from both `Company_Database` and `Outreach_Progress` sheets
- Perform JOIN operation on `Company_ID`
- Group contacts by company for frontend consumption
- Calculate stale status based on `Last_Company_Activity` and `Last_Committee_Update`
- Sort companies with >3 days no response to the top

**New Response Format:**
```typescript
{
  companies: [
    {
      id: "ME-0001",
      companyName: "ABC Corp",
      discipline: "Mechanical Engineering",
      priority: "High",
      status: "Negotiating",
      sponsorshipTier: "Gold",
      pic: "John Doe",
      followUpsCompleted: 2,
      lastUpdated: "2026-02-03T10:00:00Z",
      lastCompanyActivity: "2026-02-01T15:30:00Z",
      isFlagged: false,
      remark: "Latest company remark",
      contacts: [
        {
          id: "contact-1",
          name: "Jane Smith",
          role: "Procurement Manager",
          email: "jane@abc.com",
          phone: "+1234567890",
          linkedin: "https://linkedin.com/in/jane",
          remark: "Contact-specific note",
          isActive: true
        }
      ],
      history: [...],
      isStale: true,
      isCommitteeStale: false
    }
  ],
  committeeMembers: [...]
}
```

---

#### [MODIFY] [update.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/update.ts)

**Changes:**
- Update logic to work with `Company_ID` instead of `Company_Name`
- Support updating `Outreach_Progress` sheet fields
- Handle sponsorship tier updates
- Implement automatic status transition to "No Reply"
  - Check if `followUpsCompleted >= 3` AND `Last_Company_Activity > 3 days ago`
  - If true, set status to "No Reply" and log to history
- Update `Last_Committee_Update` on all committee actions
- Update `Last_Company_Activity` when using date-picker

**New Request Body:**
```typescript
{
  companyId: "ME-0001",
  updates: {
    status?: string,
    sponsorshipTier?: string,
    isFlagged?: boolean,
    followUpsCompleted?: number,
    lastCompanyActivity?: string,  // ISO timestamp from date-picker
    remark?: string
  },
  user: string,
  remark?: string
}
```

---

#### [MODIFY] [update-contact.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/update-contact.ts)

**Changes:**
- Update to work with `Company_Database` sheet
- Support updating contact role
- Support updating contact-specific remarks
- Support toggling `Is_Active_Contact` flag

**New Request Body:**
```typescript
{
  contactRowNumber: number,
  updates: {
    contactName?: string,
    contactRole?: string,
    contactEmail?: string,
    contactPhone?: string,
    contactLinkedIn?: string,
    contactRemarks?: string,
    isActive?: boolean
  },
  companyId: string,
  user: string
}
```

---

#### [NEW] [delete-contact.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/delete-contact.ts)

**Purpose:** Delete a contact row from `Company_Database`

**Request Body:**
```typescript
{
  contactRowNumber: number,
  companyId: string,
  user: string
}
```

**Implementation:**
- Validate that the row belongs to the specified company
- Use Google Sheets API `batchUpdate` with `DeleteDimensionRequest`
- Log deletion to `Thread_History`
- Invalidate cache

---

### Frontend Component Updates

#### [MODIFY] [CompanyDetailPage](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)

**Changes:**

##### 1. [x] Header Edit Button (Lines 379-425)
- Move pencil icon from line 414-421 to beside company name (line 391-393)
- Remove "Edit Company Details" text, show only icon
- Update layout to inline-flex with icon beside company name

##### 2. [x] Status Dropdown (Lines 455-466)
- Add "Completed" and "Interested" to `statusOptions` (line 56)
- Add conditional UI for "Interested" status:
  - Show sponsorship tier dropdown when status is "Interested"
  - Options: Official Partners, Gold, Silver, Bronze
  - Store in new state variable `sponsorshipTier`

##### 3. [x] Green Tick for Completed (Lines 391-395)
- Add conditional rendering: if status is "Completed", show green check icon beside name
- Use `CheckCircleIcon` from Heroicons in green color

##### 4. [x] Follow-Up Button Logic (Lines 489-501)
- Remove `disabled={!remarks.trim()}` restriction
- Allow logging follow-up without remarks
- Update button text to show current count: "Log Follow-up (2/3)"

##### 5. [x] Date-Picker for Company Response (NEW, after line 487)
- Add new date-time picker field above remarks textarea
- Label: "Company Last Response Date (optional)"
- When set, update `lastCompanyActivity` in the update payload
- Show prominent warning if selected date is >3 days ago

##### 6. [x] Success Notification (NEW)
- Add toast/banner notification on successful save
- Position at top of page
- Show for 3 seconds then auto-dismiss
- Message: "Company updated successfully"

##### 7. [x] Rejection Reason Flow (Lines 455-466)
- When status is "Rejected", add helper text to remarks field:
  - Placeholder: "Please provide rejection reason..."
  - Show validation error if saving "Rejected" without a remark

---

#### [MODIFY] [AllCompaniesTable](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/components/AllCompaniesTable.tsx)

**Changes:**

##### 1. Green Tick for Completed (Lines 266-272)
- Add conditional rendering in company name cell
- Show green `CheckCircleIcon` before name if status is "Completed"

##### 2. Stale Priority Sorting (Lines 51-84)
- Modify sorting logic to prioritize stale companies (>3 days no response)
- Stale companies float to top regardless of other sort settings
- Add secondary sort by `lastCompanyActivity` descending

##### 3. Status Color Updates (Lines 95-104)
- Add colors for new statuses:
  - `Completed`: `bg-green-100 text-green-700`
  - `Interested`: `bg-purple-100 text-purple-700`

---

#### [MODIFY] [CommitteeWorkspace](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/components/committee-workspace.tsx)

**Changes:**

##### 1. Kanban Column Updates (Lines 26-31)
- Add new columns for "Interested" and "Completed"
- Remove "No Reply" companies from Kanban view after 3-day grace period
- Update `statusColumns` array:
  ```typescript
  const statusColumns = [
    { id: 'To Contact', label: 'To Contact', color: 'bg-slate-100 border-slate-300' },
    { id: 'Contacted', label: 'Contacted', color: 'bg-blue-50 border-blue-300' },
    { id: 'Negotiating', label: 'Negotiating', color: 'bg-amber-50 border-amber-300' },
    { id: 'Interested', label: 'Interested', color: 'bg-purple-50 border-purple-300' },
    { id: 'Completed', label: 'Completed', color: 'bg-green-50 border-green-300' },
  ];
  ```

##### 2. Filter "No Reply" Companies (Lines 42-47)
- Add filtering logic to exclude companies with status "No Reply"
- OR companies where `followUpsCompleted >= 3` AND `daysSinceLastFollowup > 3`

---

#### [MODIFY] Contact Editing to Modal (Lines 575-683)

**Changes:**
- Convert inline contact edit form to modal popup
- Use existing modal library or create custom modal component
- Show modal on clicking "Edit" button (line 671-678)
- Include delete button in modal footer
- Confirm deletion with browser confirm dialog
- Add role field to edit form
- Separate contact remarks from company remarks UI
- Add "Mark as Active" toggle checkbox
- Apply visual highlighting (e.g., yellow background) to active contacts in the list

---

### Database Migration

#### [NEW] [migration-script.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/scripts/migrate-to-two-sheets.ts)

**Purpose:** One-time migration from existing single sheet to two-sheet architecture

**Steps:**
1. Read all data from existing sheet
2. Generate Company_IDs (ME-0001, ME-0002, etc.)
3. Split data into Company_Database and Outreach_Progress formats
4. Write to new sheets
5. Backup old sheet
6. Update environment variables

**Notes:**
- Run manually by developer
- Requires review of migrated data before deploying
- Should preserve all existing data and relationships

---

## Verification Plan

### Automated Tests

**Unit Tests:**
- Test Company_ID generation logic
- Test data JOIN operation between sheets
- Test automatic "No Reply" status transition logic
- Test stale company sorting algorithm

**Integration Tests:**
- Test full update flow with two-sheet architecture
- Test contact deletion and row removal
- Test sponsorship tier selection and storage

### Manual Verification

**Pre-Deployment:**
1. Run migration script on test spreadsheet
2. Verify all data transferred correctly
3. Test CRUD operations on both sheets
4. Confirm highlighting works for active contacts

**Post-Deployment:**
1. Verify Kanban board shows correct columns
2. Test automatic status transitions with time-based conditions
3. Verify green tick appears for completed companies
4. Test date-picker updates `lastCompanyActivity` correctly
5. Confirm stale companies appear at top of lists
6. Test contact deletion removes rows
7. Verify success notifications appear on save

**User Acceptance Testing:**
1. Have committee member test full follow-up workflow
2. Test backdating company responses with date-picker
3. Verify sponsorship tier selection for interested companies
4. Test editing and deleting contacts via modal

---

## Implementation Phases

### Phase 1: Schema & Migration
1. Design and document final schema
2. Create migration script
3. Run migration on test environment
4. Verify data integrity

### Phase 2: Backend API Updates
1. Update `data.ts` for two-sheet JOIN
2. Update `update.ts` for Company_ID and new fields
3. Update `update-contact.ts` for role and remarks
4. Create `delete-contact.ts` endpoint
5. Implement automatic "No Reply" logic

### Phase 3: Frontend Components
1. Update status dropdowns and colors
2. Add green tick for completed companies
3. Move edit icon beside company name
4. Add sponsorship tier selector
5. Add date-picker for company responses
6. Convert contact editing to modal
7. Add delete functionality
8. Add active contact highlighting

### Phase 4: Testing & Polish
1. Run automated tests
2. Manual verification
3. Fix bugs and edge cases
4. User acceptance testing

### Phase 5: Deployment
1. Run migration on production spreadsheet
2. Deploy backend and frontend updates
3. Monitor for issues
4. Gather user feedback

---

## Design Decisions

### Company ID Management
- **Existing companies**: Will already have Company IDs assigned in the spreadsheet
- **New companies**: Auto-increment from the highest existing ID (e.g., if highest is ME-0045, next is ME-0046)
- Backend will read max ID and increment on new company creation

### Testing & Migration Approach
- **Testing**: Use sample/test spreadsheets for all development and testing
- **No rollback needed**: Production migration will only happen after thorough testing on sample data
- **Migration timing**: Will be determined after successful testing phase

### UI Specifications
- **Active Contact Highlighting**: Yellow background (consistent with current implementation)
- **Date-Picker Format**: Date only (no time component needed)
