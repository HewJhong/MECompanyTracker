# Implementation Plan - Committee Workspace: Compact Mode & Custom Tooltips

## Overview
The Committee Workspace Kanban cards currently take up too much vertical space. This plan adds a **compact/normal toggle**, a **custom tooltip** for truncated company names, and fixes the **active contact** display.

## Proposed Changes

### Tooltip Component
#### [NEW] [Tooltip.tsx](file:///c:/Users/User/Documents/My%20Projects/ME%20Outreach%20Tracker%20v2/MECompanyTracker/components/Tooltip.tsx)

A lightweight, reusable custom tooltip component (not the browser native `title`).

- **Props**: `text: string`, `children: ReactNode`, `delay?: number` (default ~50ms)
- **Behavior**: On `mouseEnter`, starts a timer. After `delay` ms, renders a floating `div` positioned above (or below) the trigger element. On `mouseLeave`, hides immediately.
- **Styling**: Dark background (`bg-slate-800`), white text, rounded, small shadow, `text-xs`, `z-50`, max-width constrained so very long names wrap.
- **Positioning**: Uses a `ref` on the trigger element and `getBoundingClientRect()` to position relative to it. Falls back to below if not enough space above.

---

### Data Fix
#### [MODIFY] [committee.tsx](file:///c:/Users/User/Documents/My%20Projects/ME%20Outreach%20Tracker%20v2/MECompanyTracker/pages/committee.tsx)

Fix line 80 to find the **active** contact (marked `isActive: true` on the company details page) instead of blindly using `contacts[0]`:

```diff
- contact: company.contacts?.[0]?.picName || '',
- email: company.contacts?.[0]?.email || '',
+ const activeContact = company.contacts?.find((c: any) => c.isActive) || company.contacts?.[0];
+ contact: activeContact?.name || '',
+ email: activeContact?.email || '',
```

> [!NOTE]
> The API returns `name` on contacts, not `picName`. The old code was using `picName` which may have been returning empty strings.

---

### Workspace Component
#### [MODIFY] [CommitteeWorkspace.tsx](file:///c:/Users/User/Documents/My%20Projects/ME%20Outreach%20Tracker%20v2/MECompanyTracker/components/CommitteeWorkspace.tsx)

**1. Add compact/normal toggle state (persisted to `localStorage`)**
```typescript
const [isCompact, setIsCompact] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('committee-compact-mode') === 'true';
    }
    return false;
});

// Persist on change
useEffect(() => {
    localStorage.setItem('committee-compact-mode', String(isCompact));
}, [isCompact]);
```

**2. Add toggle button to header** (next to existing filter buttons)
- Two icon buttons: `Bars3Icon` (compact) and `Squares2X2Icon` (normal)
- Active state highlighted with blue background

**3. Compact card layout** (when `isCompact` is true):

```
 ┌────────────────────────────────────────────┐
 │  Acme Corporation Sdn Bhd...          🚩  │  ← Line 1: truncated name + flag icon
 │  🕐 3d ago                   Reply Needed  │  ← Line 2: date + status tags
 └────────────────────────────────────────────┘

 ┌────────────────────────────────────────────┐
 │  TechGlobal Industries Pty Ltd...          │  ← No flag
 │  🕐 Yesterday                        Stale │  ← Stale tag only
 └────────────────────────────────────────────┘

 ┌────────────────────────────────────────────┐
 │  ByteWave Solutions                        │  ← Short name, no truncation
 │  🕐 Today                                  │  ← No tags
 └────────────────────────────────────────────┘
```

- Company name: single line, `truncate`, wrapped in `<Tooltip text={company.name}>`
- Second line: clock icon + relative date on left, status tags ("Reply Needed" / "Stale") on right
- Reduced padding (`p-2` instead of `p-4`)
- No contact/email rows
- Thinner border (`border` instead of `border-2`)

**4. Normal card layout** (when `isCompact` is false):

```
 ┌────────────────────────────────────────────┐
 │  Acme Corporation Sdn Bhd             🚩  │  ← Company name + flag
 │                                            │
 │  John Smith                                │  ← Active contact name
 │  john@acme.com                             │  ← Active contact email
 │                                            │
 │  ─────────────────────────────────────────  │  ← Divider
 │  🕐 3d ago                   Reply Needed  │  ← Date + tags
 └────────────────────────────────────────────┘

 ┌────────────────────────────────────────────┐
 │  ByteWave Solutions                        │  ← No flag
 │                                            │
 │  Sarah Lee                                 │  ← Active contact
 │  sarah@bytewave.io                         │
 │                                            │
 │  ─────────────────────────────────────────  │
 │  🕐 Today                                  │  ← No tags
 └────────────────────────────────────────────┘
```

- Same as current layout, but wraps company name in `<Tooltip>` for consistency
- Shows the **active** contact name and email (fixed via [committee.tsx](file:///c:/Users/User/Documents/My%20Projects/ME%20Outreach%20Tracker%20v2/MECompanyTracker/pages/committee.tsx))
- Falls back to first contact if no contact is marked active

**5. Grid adjustment**: Change the Kanban grid from `lg:grid-cols-4` to `lg:grid-cols-6` so all 6 status columns are visible side-by-side on large screens.

---

### Documentation
#### [MODIFY] [plan-arch-master.md](file:///c:/Users/User/Documents/My%20Projects/ME%20Outreach%20Tracker%20v2/MECompanyTracker/docs/plan-arch-master.md)
- Add [plan-committee-compact-mode-v1.md](file:///c:/Users/User/Documents/My%20Projects/ME%20Outreach%20Tracker%20v2/MECompanyTracker/docs/features/plan-committee-compact-mode-v1.md) to the Active Design Register.

## Verification Plan

### Manual Verification
Since no automated test framework is set up in this project, verification will be manual:

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000/committee` (sign in if needed)
3. **Toggle test**: Click the compact/normal toggle buttons in the header. Verify:
   - Compact mode: cards shrink to 2 lines (name + date/tags)
   - Normal mode: cards expand to show contact name and email
4. **Tooltip test**: In compact mode, hover over a company with a long name. Verify:
   - A custom dark tooltip appears after ~50ms showing the full name
   - The tooltip is NOT the browser's native tooltip (no default yellow box)
   - Tooltip disappears when mouse leaves
5. **Active contact test**: In normal mode, verify the contact shown matches the one marked "Active" on the company details page (navigate to a company to cross-check)
6. **Status columns**: Verify all 6 columns are visible side-by-side on a wide screen
7. **Persistence test**: Toggle to compact, refresh the page — verify it stays in compact mode. Toggle back to normal, refresh — verify it stays in normal mode
