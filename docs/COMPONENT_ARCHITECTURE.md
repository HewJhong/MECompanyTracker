# Component Architecture - Outreach Tracker

## Overview
Visual representation of the component hierarchy and data flow in the refactored Outreach Tracker application.

---

## Application Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                             Layout                                    │
│  ┌───────────────┬───────────────────────────────────────────────┐  │
│  │   Sidebar     │              Main Content                     │  │
│  │  Navigation   │                                               │  │
│  │               │  ┌─────────────────────────────────────────┐ │  │
│  │ • Dashboard   │  │           Page Header                   │ │  │
│  │ • Workspace   │  │  (Title, Description, Icon)             │ │  │
│  │ • Companies   │  └─────────────────────────────────────────┘ │  │
│  │ • Analytics   │                                               │  │
│  │ • Settings    │  ┌─────────────────────────────────────────┐ │  │
│  │               │  │         Page Content                    │ │  │
│  │ Quick Stats   │  │  (Dashboard/Workspace/Companies)        │ │  │
│  │ • Active      │  │                                         │ │  │
│  │ • Pending     │  │                                         │ │  │
│  │               │  │                                         │ │  │
│  │ User Profile  │  │                                         │ │  │
│  └───────────────┴──┴─────────────────────────────────────────┘  │
│                             Footer                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard Page (index.tsx)

```
┌────────────────────────────────────────────────────────────────┐
│                      Dashboard Stats                            │
│  ┌──────────┬──────────┬──────────┬──────────┐                │
│  │ Progress │ Response │  Stalled │  Flagged │                │
│  │  Card    │   Card   │   Card   │   Card   │                │
│  └──────────┴──────────┴──────────┴──────────┘                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────┬───────────────────────────┐
│        Flagged Items               │   Member Activity         │
│  ┌──────────────────────────────┐ │  ┌─────────────────────┐ │
│  │ Company 1 [FLAG] [Status]    │ │  │ Avatar | Name       │ │
│  │ Company 2 [FLAG] [Status]    │ │  │ Avatar | Name       │ │
│  │ ... (List of flagged)        │ │  │ Avatar | Name       │ │
│  └──────────────────────────────┘ │  └─────────────────────┘ │
│                                    │                           │
│      Committee Leaderboard         │                           │
│  ┌──────────────────────────────┐ │                           │
│  │ 🥇 Member 1 [========75%]    │ │                           │
│  │ 🥈 Member 2 [=======70%]     │ │                           │
│  │ 🥉 Member 3 [======65%]      │ │                           │
│  │    Member 4 [=====50%]       │ │                           │
│  └──────────────────────────────┘ │                           │
│                                    │                           │
│      Quick Action Cards            │                           │
│  ┌────────────┬─────────────────┐ │                           │
│  │ Workspace  │  All Companies  │ │                           │
│  └────────────┴─────────────────┘ │                           │
└────────────────────────────────────┴───────────────────────────┘
```

---

## Committee Workspace Page (committee.tsx)

```
┌────────────────────────────────────────────────────────────────┐
│  Search: [_____________] [Stale Filter]                        │
└────────────────────────────────────────────────────────────────┘

┌────────────┬────────────┬────────────┬────────────┐
│ To Contact │ Contacted  │ Negotiating│  Closed    │
├────────────┼────────────┼────────────┼────────────┤
│ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │
│ │Company1│ │ │Company2│ │ │Company3│ │ │Company4│ │
│ │Contact │ │ │Contact │ │ │Contact │ │ │Contact │ │
│ │Email   │ │ │Email   │ │ │Email   │ │ │Email   │ │
│ │[Time]  │ │ │[Time]  │ │ │[Time]  │ │ │[Time]  │ │
│ └────────┘ │ └────────┘ │ └────────┘ │ └────────┘ │
│            │            │            │            │
│ ┌────────┐ │ ┌────────┐ │            │ ┌────────┐ │
│ │Company5│ │ │Company6│ │            │ │Company7│ │
│ │[STALE] │ │ │[FLAG]  │ │            │ │        │ │
│ └────────┘ │ └────────┘ │            │ └────────┘ │
└────────────┴────────────┴────────────┴────────────┘
```

---

## All Companies Page (companies.tsx)

```
┌────────────────────────────────────────────────────────────────┐
│  Search: [________________________]                            │
│  Filter: [All Statuses ▼] [All Assignees ▼] [Clear Filters]   │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Name ↕     │ Status ↕    │ Assigned ↕  │ Contact    │ Action  │
├────────────┼─────────────┼─────────────┼────────────┼─────────┤
│ [FLAG] Co1 │ [Contacted] │ Ryan Chen   │ John Doe   │ [View]  │
│ Company 2  │ [Closed]    │ Natasha W.  │ Jane Smith │ [View]  │
│ [FLAG] Co3 │ [Stalled]   │ Marcus Tan  │ Ahmad H.   │ [View]  │
│ Company 4  │ [Negotiat.] │ Cindy Lim   │ Sarah Lee  │ [View]  │
│ ...        │ ...         │ ...         │ ...        │ ...     │
└────────────┴─────────────┴─────────────┴────────────┴─────────┘
```

---

## Company Modal (Overlay)

```
┌──────────────────────────────────────────────────────────────┐
│  COMPANY NAME [FLAG]                                    [X]  │
│  [Status Badge]  Assigned to: Ryan Chen                     │
├──────────────────────────────────────────────────────────────┤
│  [Details] [Contacts] [History]                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  DETAILS TAB:                                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Update Status:  [Dropdown ▼]                          │ │
│  │                                                        │ │
│  │ Add Remark:                                            │ │
│  │ ┌────────────────────────────────────────────────────┐ │ │
│  │ │ [Textarea for remarks]                             │ │ │
│  │ │                                                    │ │ │
│  │ └────────────────────────────────────────────────────┘ │ │
│  │                                                        │ │
│  │ [✓] Request Attention (Flag for lead)                 │ │
│  │                                                        │ │
│  │ Discipline: Mechanical Eng  |  Priority: High         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  CONTACTS TAB:                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [+ Add Contact]                                        │ │
│  │                                                        │ │
│  │ Contact 1                                              │ │
│  │ • Name: John Doe                                       │ │
│  │ • Phone: +60 12-345-6789                              │ │
│  │ • Email: john@company.com                             │ │
│  │                                                        │ │
│  │ Contact 2 ...                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  HISTORY TAB:                                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ● Ryan Chen - 2 days ago                              │ │
│  │   Updated status to Contacted                          │ │
│  │   "Sent initial email with deck"                       │ │
│  │                                                        │ │
│  │ ● Natasha Wong - 5 days ago                           │ │
│  │   Assigned to Ryan Chen                                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│                              [Cancel] [Save Changes]          │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Dependency Tree

```
App
├── Layout
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── Navigation Links
│   │   ├── Quick Stats
│   │   └── User Profile
│   ├── Mobile Header
│   ├── Main Content (children)
│   └── Footer
│
├── Dashboard Page (/)
│   ├── DashboardStats
│   │   ├── Progress Card
│   │   ├── Response Card
│   │   ├── Stalled Card
│   │   └── Flagged Card
│   ├── FlaggedItems
│   │   └── Company List Items
│   ├── CommitteeLeaderboard
│   │   └── Member Progress Bars
│   ├── MemberActivity
│   │   └── Member Rows with Status
│   └── Quick Action Cards
│
├── Committee Page (/committee)
│   └── committee-workspace
│       ├── Search & Filter Controls
│       └── Kanban Columns
│           └── Company Cards
│
├── Companies Page (/companies)
│   └── AllCompaniesTable
│       ├── Search & Filter Controls
│       └── Data Table
│           └── Company Rows
│
└── CompanyModal (Shared Overlay)
    ├── Modal Header
    ├── Tab Navigation
    ├── Details Tab
    │   ├── Status Dropdown
    │   ├── Remarks Textarea
    │   └── Flag Toggle
    ├── Contacts Tab
    │   ├── Add Contact Form
    │   └── Contact List
    └── History Tab
        └── Timeline Items
```

---

## Data Flow

```
API Layer (Future)
     ↓
   Mock Data (Current)
     ↓
   Page Component
     ↓
┌────┴────┬────────┬─────────┐
│         │        │         │
Stats   List   Leaderboard  Modal
Props   Props    Props      Props
│         │        │         │
└────┬────┴────────┴─────────┘
     ↓
Component State (useState)
     ↓
User Interactions
     ↓
API Calls (onSave)
     ↓
Optimistic UI Update
```

---

## State Management

### Page Level State
```typescript
// Dashboard
- data: Company[]
- loading: boolean
- selectedCompany: Company | null
- isModalOpen: boolean

// Committee Workspace
- companies: Company[]
- searchTerm: string
- showOnlyStale: boolean

// All Companies
- companies: Company[]
- searchTerm: string
- statusFilter: string
- assigneeFilter: string
- sortField: string
- sortDirection: 'asc' | 'desc'
```

### Component Level State
```typescript
// CompanyModal
- activeTab: 'details' | 'contacts' | 'history'
- status: string
- remarks: string
- isFlagged: boolean
- isSaving: boolean
- showAddContact: boolean
- newContact: Contact

// Layout
- sidebarOpen: boolean
```

---

## Event Handlers

### Primary Interactions
```typescript
// View Company Details
onCompanyClick(companyId: string) → Opens Modal

// Save Company Updates
onSave(updates: Partial<Company>) → API Call

// Search/Filter
onChange(event) → Updates State → Re-renders List

// Sort
onSort(field: string) → Updates Sort State → Re-orders List

// Tab Navigation
onClick(tab: string) → Updates Active Tab → Shows Content

// Close Modal
onClose() → Resets State → Hides Modal
```

---

## Styling Architecture

### Tailwind Classes
```css
/* Layout */
.container { max-w-[1600px] mx-auto }

/* Cards */
.card { bg-white rounded-xl shadow-sm border p-6 }

/* Buttons */
.btn-primary { bg-blue-600 hover:bg-blue-700 }

/* Status Badges */
.badge-success { bg-green-100 text-green-700 }
.badge-warning { bg-amber-100 text-amber-700 }
.badge-danger { bg-red-100 text-red-700 }

/* Hover States */
.hover-lift { hover:shadow-md transition-shadow }
```

### Custom Animations (globals.css)
```css
@keyframes fadeIn { ... }
@keyframes slideInFromRight { ... }

.animate-fade-in { ... }
.animate-slide-in { ... }
```

---

## Responsive Breakpoints

```
Mobile First:
  Default (0px)     → 1 column, full width
  sm (640px)       → 2 columns for cards
  md (768px)       → Show sidebar, 2 columns
  lg (1024px)      → 3-4 columns, side-by-side
  xl (1280px)      → Max width container
  2xl (1536px)     → Wider container
```

---

## Accessibility Features

### Keyboard Navigation
```
Tab         → Focus next element
Shift+Tab   → Focus previous element
Enter/Space → Activate button/link
Escape      → Close modal
```

### Screen Reader Support
```html
<button aria-label="Close modal">
  <XMarkIcon aria-hidden="true" />
</button>

<input 
  id="search"
  aria-label="Search companies"
/>

<div role="dialog" aria-modal="true">
  ...
</div>
```

---

## Performance Optimizations

### React Optimizations
- useMemo for filtered/sorted lists
- useCallback for event handlers (future)
- Component lazy loading (future)

### CSS Optimizations
- GPU-accelerated transforms
- Will-change for animations
- Contain for layout isolation

### Network Optimizations
- API caching (60s TTL)
- Optimistic UI updates
- Debounced search inputs (future)

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| CSS Grid | ✅ | ✅ | ✅ | ✅ |
| Flexbox | ✅ | ✅ | ✅ | ✅ |
| Transforms | ✅ | ✅ | ✅ | ✅ |
| Gradients | ✅ | ✅ | ✅ | ✅ |
| Custom Props | ✅ | ✅ | ✅ | ✅ |

---

**Last Updated:** January 29, 2026  
**Version:** 1.0.0
