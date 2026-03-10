# Two-Sheet Architecture - Schema Documentation

## Overview
The application now uses two separate Google Sheets to separate concerns:
- **Company Database (SPREADSHEET_ID_1)**: Static contact information
- **Outreach Tracker (SPREADSHEET_ID_2)**: Dynamic outreach progress

Both sheets are linked via **Company ID** (format: ME-0001, ME-0002, etc.)

---

## Company Database Schema (SPREADSHEET_ID_1)

**Sheet Name**: Use the sheet that is label [AUTOMATION ONLY]

**Row Structure**: One row per contact (multiple rows per company allowed)

| Column | Index | Field Name | Type | Description |
|--------|-------|------------|------|-------------|
| A | 0 | Company ID | String | Unique identifier (e.g., ME-0001) |
| B | 1 | Company Name | String | Display name for company |
| C | 2 | Discipline | String | IT & Engineering discipline |
| D | 3 | Target Sponsorship Tier | String | Desired tier to push for |
| E | 4 | Previous Response | String | Last response from this contact |
| F | 5 | Company PIC | String | Contact person name |
| G | 6 | Role | String | Contact's job title/position |
| H | 7 | Email | String | Contact email |
| I | 8 | Phone Number | String | Mobile phone |
| J | 9 | Landline Number | String | Office landline |
| K | 10 | LinkedIn | URL | LinkedIn profile |
| L | 11 | Reference | String | Lecturer/referral name |
| M | 12 | Remarks | String | Contact-specific or general notes |
| N | 13 | Is_Active | Boolean | TRUE/FALSE for active contact (hidden, drives conditional formatting) |

**Notes:**
- Multiple rows can have the same Company ID (one per contact)
- Company Name is duplicated for easier viewing, but Company ID is the primary key
- **Is_Active column (N)**: Hidden column used for conditional formatting. When TRUE, the row can be highlighted yellow automatically using Google Sheets conditional formatting rules.

---

## Outreach Tracker Schema (SPREADSHEET_ID_2)

**Sheet Name**: Auto-detected (uses first sheet)
**Row Structure**: One row per company (Company ID must be unique)

| Column | Index | Field Name | Type | Description |
|--------|-------|------------|------|-------------|
| A | 0 | Company ID | String | Foreign key to Company Database |
| B | 1 | Company Name | String | Display name (for reference) |
| C | 2 | Status | Enum | To Contact, Contacted, Negotiating, Interested, Completed, Rejected, No Reply |
| D | 3 | Urgency Score | Number | 1-10 scale, auto or manual |
| E | 4 | Previous Response | String/Date | Last response from company |
| F | 5 | Assigned PIC | String | Committee member assigned |
| G | 6 | Last Contact | String/Date | Last committee outreach/follow-up |
| H | 7 | Follow-up Count | Number | Number of follow-ups sent |
| I | 8 | Sponsorship Tier | String | Official Partners, Gold, Silver, Bronze |
| J | 9 | Remarks | String | Company-level outreach notes |
| K | 10 | Last Update | String/Date | Any update timestamp |

**Notes:**
- Company ID must be unique (one row per company)
- Status drives Kanban board columns
- Urgency Score will be populated by email automation

---

## Thread_History Schema (SPREADSHEET_ID_2)

**Sheet Name**: Thread_History
**Row Structure**: One row per action/remark

| Column | Index | Field Name | Type | Description |
|--------|-------|------------|------|-------------|
| A | 0 | Timestamp | Date/Time | When action occurred |
| B | 1 | Company ID | String | Which company (changed from Company Name) |
| C | 2 | User | String | Committee member name |
| D | 3 | Action/Remark | String | What happened or remark text |

---

## Logs_DoNotEdit Schema (SPREADSHEET_ID_2)

**Sheet Name**: Logs_DoNotEdit
**Row Structure**: One row per update action (system activity log)

| Column | Index | Field Name | Type | Description |
|--------|-------|------------|------|-------------|
| A | 0 | Timestamp | Date/Time | When update occurred |
| B | 1 | User | String | Committee member who made the update |
| C | 2 | Company ID | String | Unique identity of the company |
| D | 3 | Company Name | String | Company that was updated |
| E | 4 | Updates JSON | String | JSON string of all field updates |

**Notes:**
- This is an append-only audit log for all company updates
- The `Updates JSON` column contains a stringified JSON object of all changes made
- Used for debugging and tracking system changes
- Should not be manually edited (hence the name)
- **Migration Note**: The code will be updated to log both Company ID and Company Name for better traceability.

**Example Row:**
```
2026-02-04T10:30:00Z | John Doe | ME-0001 | ABC Corporation | {"status":"Negotiating","followUpsCompleted":2}
```

---

## Data API Response Format

The `/api/data` endpoint joins both sheets and returns:

```typescript
{
  companies: [
    {
      id: "ME-0001",
      companyName: "ABC Corporation",
      
      // From Outreach Tracker
      status: "Negotiating",
      urgencyScore: 7,
      pic: "John Doe",
      followUpsCompleted: 2,
      sponsorshipTier: "Gold",
      remark: "Latest company-level note",
      lastUpdated: "2026-02-04T10:00:00Z",
      lastCompanyActivity: "2026-02-01T15:00:00Z",
      lastContact: "2026-02-03T09:00:00Z",
      
      // From Database (first row)
      discipline: "Mechanical Engineering",
      targetSponsorshipTier: "Official Partners",
      reference: "Prof. Smith",
      
      // Calculated
      isFlagged: false,
      isCommitteeStale: false,
      isCompanyStale: true,
      
      // Contacts (from all matching Database rows)
      contacts: [
        {
          id: "contact-ME-0001-0",
          rowNumber: 2,
          name: "Jane Doe",
          role: "Procurement Manager",
          email: "jane@abc.com",
          phone: "+1234567890",
          landline: "+1234567800",
          linkedin: "https://linkedin.com/in/jane",
          remark: "Procurement head, responsive",
          isActive: true
        },
        {
          id: "contact-ME-0001-1",
          rowNumber: 3,
          name: "Bob Smith",
          role: "Finance Manager",
          email: "bob@abc.com",
          phone: "+1234567891",
          landline: "",
          linkedin: "",
          remark: "Finance manager, CC on emails",
          isActive: false
        }
      ],
      
      // History
      history: [
        {
          id: "history-0",
          timestamp: "2026-02-01T10:00:00Z",
          companyId: "ME-0001",
          user: "John Doe",
          action: "Sent initial email",
          remark: "Sent initial email"
        }
      ]
    }
  ],
  committeeMembers: [...]
}
```

---

## Column Mapping Reference

### Database Sheet (A2:N)
```
A: companyId
B: companyName (duplicate, for viewing)
C: discipline
D: targetSponsorshipTier
E: previousResponse (contact-level)
F: name (Company PIC)
G: role (job title)
H: email
I: phone
J: landline
K: linkedin
L: reference
M: remark (contact-specific)
N: isActive (hidden, for conditional formatting)
```

### Tracker Sheet (A2:K)
```
A: companyId
B: companyName (duplicate, for viewing)
C: status
D: urgencyScore
E: previousResponse (company-level)
F: assignedPic
G: lastContact
H: followUpsCompleted
I: sponsorshipTier
J: remarks (company-level)
K: lastUpdate
```

---

## Stale Status Calculation

The API automatically calculates stale flags:
- **isCommitteeStale**: `true` if > 7 days since `lastUpdate`
- **isCompanyStale**: `true` if > 7 days since `lastCompanyActivity`

These are used in the UI to highlight companies needing attention.
