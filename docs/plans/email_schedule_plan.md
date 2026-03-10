# Email Schedule Feature — Implementation Plan

## Overview

Implement a comprehensive email scheduling system for committee outreach. Since a shared Gmail account is used with a rate limit of **3 emails per 15 minutes**, the system must coordinate all committee members' send times globally to avoid overlaps and respect blocked periods (lunch, after-hours). 

## Key Requirements

- **Rate limit**: 3 emails per 15 minutes (shared across all PICs)
- **Blocked periods**: Configurable (default: 12:00–13:00 lunch, after 16:00 end-of-day)
- **Bulk assign flow**: Admin selects companies → picks assignee → picks date → picks start time (with auto-suggest) → system calculates end time → warns if out of bounds → confirm
- **New admin page**: `/email-schedule` — horizontal cards by date, companies grouped by PIC, showing scheduled send times. Admins can edit/rearrange.
- **Committee workspace**: Show scheduled send time in full card view (read-only)
- **Storage**: New `Email_Schedule` sheet in the tracker spreadsheet

---

## Phase 1: Backend — Email Schedule Data Layer

### [NEW] `lib/email-schedule.ts`

Shared utility module for email schedule logic:
- **`EmailScheduleEntry` interface**: `{ companyId, companyName, pic, date, time, order }`
- **`getEmailSchedule(date?: string)`**: Reads `Email_Schedule` sheet, returns entries (optionally filtered by date)
- **`saveEmailScheduleEntries(entries[])`**: Writes/updates entries to the sheet
- **`deleteEmailScheduleEntries(companyIds[], date)`**: Removes entries for given companies on a date
- **`calculateTimeSlots(startTime, count, blockedPeriods)`**: Given a start time and number of emails, computes the scheduled time for each email (3 per 15 min), skipping blocked periods. Returns array of times + the computed end time.
- **`getNextAvailableStartTime(date, blockedPeriods)`**: Looks at existing schedule for a date and returns the next available start time after the last scheduled email
- **`checkTimeConflicts(date, startTime, count, blockedPeriods)`**: Validates the proposed schedule against existing entries and blocked periods. Returns `{ valid, warnings[], conflictingEntries[] }`

### [NEW] `pages/api/email-schedule/index.ts`

REST API for the email schedule:
- **GET**: Returns all schedule entries, optionally filtered by `?date=YYYY-MM-DD` or `?pic=Name`
- **POST**: Creates new schedule entries (used by bulk-assign flow). Accepts `{ companyIds, pic, date, startTime }`. Internally calls `calculateTimeSlots` and `saveEmailScheduleEntries`.
- **PUT**: Updates existing entries (for rearranging on the schedule page). Accepts `{ entries: [{ companyId, date, time, pic }] }`
- **DELETE**: Removes entries. Accepts `{ companyIds, date }`

### [NEW] `pages/api/email-schedule/settings.ts`

API for email schedule configuration (blocked periods, rate limits):
- **GET**: Returns current settings from `Email_Schedule_Settings` sheet (or defaults)
- **POST**: Saves settings

Default settings structure:
```json
{
  "emailsPerBatch": 3,
  "batchIntervalMinutes": 15,
  "blockedPeriods": [
    { "label": "Lunch", "start": "12:00", "end": "13:00" },
    { "label": "After Hours", "start": "16:00", "end": "23:59" }
  ],
  "defaultStartTime": "08:00"
}
```

### [NEW] `pages/api/email-schedule/available-slots.ts`

Utility endpoint for the bulk-assign flow:
- **GET `?date=YYYY-MM-DD`**: Returns the next available start time for a given date, considering existing schedule entries and blocked periods

---

## Phase 2: Enhanced Bulk Assign Flow

### [MODIFY] `pages/companies.tsx`

Update the bulk action bar to include new fields:
- Add **date picker** input (for the scheduled send date)
- Add **start time** input (with auto-populated suggestion from `available-slots` API)
- Show **calculated end time** preview (computed client-side using the same `calculateTimeSlots` logic)
- Show **warning banners** if:
  - End time hits a blocked period (amber warning, still allows confirm)
  - Start time overlaps with existing schedule (red warning, blocks confirm)
  - No blocked period issues (green checkmark)

### [MODIFY] `pages/api/bulk-assign.ts`

Extend the existing bulk-assign API:
- Accept additional optional fields: `{ date, startTime }` in the request body
- After successfully assigning the PIC, also call the email schedule save logic to create schedule entries
- If `date` and `startTime` are provided, validate against conflicts before proceeding

---

## Phase 3: Email Schedule Admin Page

### [NEW] `pages/email-schedule.tsx`

Admin-only page showing the email schedule:

**Layout**:
- Page header with title "Email Schedule" and icon
- Horizontal scrolling container of **date cards**
- Each date card is a vertical box with:
  - Date header (e.g., "Mon, Mar 10")
  - Total email count for that date
  - Companies grouped by PIC
  - Each PIC section shows their name and list of companies
  - Each company row shows: `[time] Company Name` (e.g., "8:00 AM — Acme Corp")

**Features**:
- **Date range filter** (show last 7 days, next 7 days, custom range)
- **Edit mode** — allows admin to:
  - Change a company's scheduled time (inline time picker)
  - Change a company's scheduled date (drag between date cards, or dropdown)
  - Change a company's PIC (dropdown)
  - Remove a company from the schedule (delete button with confirmation)
- **Add to schedule** button — opens modal to manually schedule companies not yet on the schedule
- All edits use the PUT/DELETE APIs and **optimistic updates** with rollback on error (following existing pattern from `companies.tsx`)

**Card Design** (similar to CommitteeWorkspace but horizontal):
- Use the same card styling: white background, border, rounded corners, status accent colors
- Each date is a column-like card that scrolls horizontally
- PIC groups have a subtle header with the member's name
- Company rows are compact with time + company name

### [MODIFY] `components/Layout.tsx`

Add the Email Schedule page to the admin nav:
```typescript
...(effectiveIsAdmin ? [
    { name: 'Email Schedule', href: '/email-schedule', icon: CalendarDaysIcon, description: 'Email send schedule' },
    { name: 'Settings', href: '/settings', icon: Cog6ToothIcon, description: 'Admin settings' }
] : []),
```

---

## Phase 4: Committee Workspace Integration

### [MODIFY] `components/CommitteeWorkspace.tsx`

- Add `scheduledTime?: string` to the `Company` interface
- In the **full card view**, show the scheduled time if available:
  - Small clock icon + time text below the company name (e.g., "🕐 8:00 AM")
  - Styled subtly (text-xs text-slate-500)
- **Compact view** remains unchanged (per requirements)

### [MODIFY] `pages/committee.tsx`

- Fetch email schedule data for the current user's companies
- Merge schedule data into the company objects before passing to `CommitteeWorkspace`
- Add the `scheduledTime` field to the transformed company data

---

## Phase 5: Settings — Email Schedule Configuration

### [MODIFY] `pages/settings.tsx`

Add a new **"Email Schedule"** tab to the Settings page:
- **Rate Settings**: Emails per batch (default: 3), Batch interval in minutes (default: 15)
- **Blocked Periods**: Editable list of blocked periods
  - Each row: Label, Start Time, End Time, Delete button
  - "Add Blocked Period" button
- **Default Start Time**: Time picker (default: 08:00)
- Save button that calls `POST /api/email-schedule/settings`

---

## Phase 6: Client-Side Time Calculation Utility

### [NEW] `lib/schedule-calculator.ts`

Shared client-side utility (also usable server-side) for time calculations:
- `calculateTimeSlots(startTime: string, count: number, blockedPeriods: BlockedPeriod[], emailsPerBatch: number, intervalMinutes: number)` → `string[]`
  - Returns array of time strings (HH:mm) for each email
  - Skips blocked periods automatically
  - E.g., start=08:00, count=21, batch=3, interval=15 → [08:00, 08:00, 08:00, 08:15, 08:15, 08:15, ...]
- `getEndTime(timeSlots: string[])` → `string` — returns the last time slot
- `checkBlockedPeriodWarnings(timeSlots: string[], blockedPeriods: BlockedPeriod[])` → `Warning[]`

> [!IMPORTANT]
> This module is designed to work both client-side (for real-time preview in bulk-assign flow) and server-side (for validation in the API). This avoids duplicating logic.

---

## Data Schema

### `Email_Schedule` Sheet (new)

| Column | Header | Description |
|--------|--------|-------------|
| A | Company ID | Company identifier |
| B | Company Name | For display convenience |
| C | PIC | Assigned committee member |
| D | Date | Scheduled date (YYYY-MM-DD) |
| E | Time | Scheduled time (HH:mm) |
| F | Order | Sort order within the same time slot |
| G | Created At | Timestamp of when the entry was created |
| H | Created By | Who created the entry |

### `Email_Schedule_Settings` Sheet (new)

| Column | Header | Description |
|--------|--------|-------------|
| A | Key | Setting key |
| B | Value | Setting value (JSON for complex values) |

Example rows:
- `emailsPerBatch` | `3`
- `batchIntervalMinutes` | `15`
- `defaultStartTime` | `08:00`
- `blockedPeriods` | `[{"label":"Lunch","start":"12:00","end":"13:00"},{"label":"After Hours","start":"16:00","end":"23:59"}]`

---

## Verification Plan

### Manual Testing (Browser)

Since the project has no automated test infrastructure, verification will be done via manual browser testing:

1. **Settings tab**: Navigate to Settings → Email Schedule tab → verify blocked periods and rate settings are editable and persist after page reload

2. **Bulk assign with scheduling**:
   - Go to All Companies → select ~10 companies → pick an assignee
   - Verify date picker and start time appear
   - Verify auto-suggested start time is correct
   - Verify end time preview updates in real-time
   - Confirm assignment → verify schedule entries are created

3. **Conflict detection**:
   - Assign a 2nd batch to the same date → verify start time auto-suggests after the first batch
   - Try manually setting a conflicting start time → verify warning/block

4. **Email Schedule page**:
   - Navigate to Email Schedule page (admin only)
   - Verify date cards show correctly with companies grouped by PIC
   - Test editing: change time, change date, change PIC, remove company
   - Verify changes persist after page reload

5. **Committee workspace**:
   - Log in as a committee member
   - Navigate to Committee Workspace
   - Verify scheduled times appear in full card view
   - Verify scheduled times do NOT appear in compact view

6. **Non-admin access**:
   - Log in as a non-admin committee member
   - Verify Email Schedule page is not visible in navigation
   - Verify direct URL access is blocked

> [!NOTE]
> Since these are manual tests, I will use the browser tool to verify the UI flows during implementation. I'll also ask you to verify the end-to-end flow after each phase is complete.

---

## Implementation Order

I recommend implementing in this order to allow incremental testing:

1. **Phase 6** → Shared time calculation utility (no dependencies, testable in isolation)
2. **Phase 1** → Backend data layer and APIs  
3. **Phase 5** → Settings page (so we can configure blocked periods before testing scheduling)
4. **Phase 2** → Enhanced bulk assign flow
5. **Phase 3** → Email Schedule admin page
6. **Phase 4** → Committee workspace integration
