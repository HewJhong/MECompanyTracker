# Plan: Redesign Company Detail Layout

## Problem Statement

Currently, the company detail page uses a tab-based layout (Details, Contacts, History) which requires users to switch between tabs to view contact information while updating company details or adding remarks. This creates friction when users need to reference contact information while making updates.

## Layout Options

I've identified three potential approaches:

### Option 1: Two-Column Layout (Recommended)
Split the page into two columns on larger screens:
- **Left Column (60%)**: Details panel with status, remarks, quick actions
- **Right Column (40%)**: Contacts list (read-only view with edit buttons)
- **Bottom Section**: History timeline (full width)
- **Mobile**: Stack vertically

```text
+-------------------------------------------------------+
|  Header (Name, Status Icon, Edit Button)              |
+---------------------------+---------------------------+
|                           |                           |
|  LEFT COLUMN (60%)        |  RIGHT COLUMN (40%)       |
|                           |                           |
|  [Status Dropdown]        |  [ + Add Contact ]        |
|  [Sponsorship Tier]       |                           |
|  [Remarks Box]            |  +---------------------+  |
|  [Priority/Discipline]    |  | Contact Card 1      |  |
|                           |  | Name, Role, Email   |  |
|                           |  +---------------------+  |
|                           |                           |
|                           |  +---------------------+  |
|                           |  | Contact Card 2      |  |
|                           |  +---------------------+  |
|                           |                           |
+---------------------------+---------------------------+
|                                                       |
|  History / Timeline (Full Width)                      |
|                                                       |
+-------------------------------------------------------+
```

**Pros:**
- All key information visible at once
- Maintains current functionality
- Clean visual separation
- Easy to reference contacts while editing

**Cons:**
- Less horizontal space for each section
- May feel cramped on smaller laptop screens

---

### Option 2: Collapsible Sections (No Tabs)
Remove tabs entirely and display all sections vertically with collapsible panels:
- Details (expanded by default)
- Contacts (expanded by default)
- History (collapsed by default)

```text
+-------------------------------------------------------+
|  Header                                               |
+-------------------------------------------------------+
|  v DETAILS SECTION                                    |
|    [Status] [Remarks] ...                             |
|                                                       |
+-------------------------------------------------------+
|  v CONTACTS SECTION                                   |
|    [ + Add Contact ]                                  |
|    [Contact Card 1]                                   |
|    [Contact Card 2]                                   |
+-------------------------------------------------------+
|  > HISTORY SECTION (Collapsed)                        |
+-------------------------------------------------------+
```

**Pros:**
- Simple implementation
- Scroll to see everything
- Works well on all screen sizes

**Cons:**
- Requires more scrolling
- Less efficient use of screen real estate

---

### Option 3: Fixed Contact Sidebar
Keep contacts in a fixed right sidebar that's always visible:
- **Main Content**: Details and History (tabs or sections)
- **Right Sidebar**: Contacts (fixed/sticky)

```text
+-----------------------------------+-------------------+
|  Header                           |                   |
+-----------------------------------|                   |
|  [Tabs: Details | History ]       |  FIXED SIDEBAR    |
|                                   |                   |
|  [Status Dropdown]                |  [ + Add ]        |
|  [Remarks Box]                    |                   |
|                                   |  [Contact 1]      |
|                                   |                   |
|                                   |  [Contact 2]      |
|                                   |                   |
|                                   |                   |
+-----------------------------------+-------------------+
```

**Pros:**
- Contacts always visible regardless of tab
- Efficient use of space
- Clear visual hierarchy

**Cons:**
- More complex responsive behavior
- Sidebar may take up too much space on smaller screens

## Recommended Approach

**Option 1: Two-Column Layout** provides the best balance of usability and screen space efficiency. It keeps related information together while maintaining a clean, organized interface.

## Proposed Changes

### [Component] Company Detail Page

#### [MODIFY] [[id].tsx](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/outreach-tracker/pages/companies/%5Bid%5D.tsx)

**Phase 1: Restructure Layout**
- Remove tab navigation for Details and Contacts
- Create two-column grid layout (desktop: 60/40 split)
- Move Details content to left column
- Move Contacts content to right column
- Keep History as a separate section below (or keep it as an optional tab)

**Phase 2: Responsive Behavior**
- Desktop (lg+): Two-column layout
- Tablet/Mobile: Stack vertically (Details → Contacts → History)

**Phase 3: Contact Display**
- Show contacts in compact card format
- Keep "Add Contact" and "Edit" functionality
- Maintain contact edit modal/form

## Verification Plan

### Manual Verification
1. **Desktop Layout**: Open a company detail page on a large screen and verify:
   - Details panel appears on the left (status, remarks, etc.)
   - Contacts panel appears on the right
   - Both panels are visible simultaneously
   - History section appears below (full width)

2. **Mobile Layout**: Resize browser to mobile width and verify:
   - Sections stack vertically in order: Details → Contacts → History
   - All functionality remains accessible

3. **Functionality Check**:
   - Add/edit company details and verify save works
   - Add/edit contacts and verify save works
   - Verify remarks can be added while viewing contact info

4. **Edge Cases**:
   - Test with companies that have 0 contacts
   - Test with companies that have many contacts (5+)
