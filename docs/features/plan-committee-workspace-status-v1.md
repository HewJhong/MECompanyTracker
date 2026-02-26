# Committee Workspace Status Synchronization (v1)

## 📅 Date & Time of Generation
2026-02-26 23:15:00

## 🎯 Actionable Goal
Synchronize the status columns in the `CommitteeWorkspace` component with the valid outreach statuses defined in the company details page to ensure committee members see accurate categorizations of their assigned companies.

## 💡 Proposed Design / Flow / Architecture
The `pages/companies/[id].tsx` file defines the source of truth for valid company outreach statuses:
`['To Contact', 'Contacted', 'Interested', 'Registered', 'Rejected', 'No Reply']`

However, the `components/CommitteeWorkspace.tsx` currently hardcodes the following stale status columns:
`['To Contact', 'Contacted', 'Negotiating', 'Interested', 'Completed']`

This mismatch causes companies with statuses like "Registered" or "Rejected" to disappear from the committee member's dashboard.

**The Fix:**
Update the `statusColumns` array in `CommitteeWorkspace.tsx` to match the exact list from the details page, assigning appropriate semantic UI colors to the new statuses.

## 🔧 Implementation Details / Key Components
- **File:** `components/CommitteeWorkspace.tsx`
  - [MODIFY] `statusColumns` constant to:
    - `To Contact` (slate)
    - `Contacted` (blue)
    - `Interested` (purple)
    - `Registered` (green)
    - `Rejected` (red)
    - `No Reply` (gray)

## ⚖️ Rationale for New Major Version
v1: Initial alignment of workspace statuses to global project terminology.
