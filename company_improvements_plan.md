# Company List & Details Improvements Plan

## Goal

Address four critical usability issues in the All Companies list and Company Details page to improve the user experience for committee members managing company outreach.

## User Clarifications Received ✅

- **Issue #2**: Make discipline directly editable (no edit mode needed) - the edit button placement at top is unintuitive
- **Issue #4**: `previousResponse` is a database column (Column E in Outreach Tracker) that stores whether the company participated previously, used to decide whether to invite them again

## Proposed Changes

### Issue #1: Add Companies Button Missing

Currently, there's no way for committees to add new companies from the All Companies page.

#### [NEW] [AddCompanyModal.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/components/AddCompanyModal.tsx)

**Purpose**: A modal component to add new companies with contact details.

**Fields to include**:
- Company Name (required)
- Discipline (dropdown, required)
- Priority (dropdown, optional, default: Medium)
- Initial contact name (optional)
- Initial contact email (optional)
- Initial contact phone (optional)
- Initial contact role (optional)
- Assigned To (dropdown, admin only, optional)
- Remarks (optional)

**Features**:
- Form validation (company name and discipline required)
- Optimistic UI update (add to local state immediately)
- Background sync to Google Sheets
- Error handling with rollback
- Success notification

---

#### [MODIFY] [companies.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies.tsx)

**Changes**:
- Add "Add Company" button in the page header (next to the title)
- Import and integrate `AddCompanyModal` component
- Add state management for the modal (open/close)
- Implement `handleAddCompany` function to call the backend API
- Use optimistic update pattern consistent with bulk assign

**UI Location**: Place button in the header section (lines 211-222), aligned to the right

---

#### [NEW] [/api/add-company.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/add-company.ts)

**Purpose**: Backend API to add a new company to Google Sheets.

**Functionality**:
- Generate new company ID (ME-XXXX format, next available number)
- Validate required fields (company name, discipline)
- Append to main companies sheet
- If contact details provided, add to contacts sheet
- Log creation action to history/logs
- Return created company with ID

**Request body**:
```json
{
  "companyName": string,
  "discipline": string,
  "priority"?: string,
  "assignedTo"?: string,
  "contact"?: {
    "name"?: string,
    "email"?: string,
    "phone"?: string,
    "role"?: string
  },
  "remark"?: string,
  "user": string
}
```

---

### Issue #2: Make Discipline Directly Editable

**Current State**: Discipline can only be changed by entering edit mode (clicking the pencil icon at the top), which is unintuitive.

**Solution**: Make discipline directly editable like the status dropdown - no edit mode required.

#### [MODIFY] [companies/[id].tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)

**Changes**:
- Remove the `isEditMode` condition for discipline dropdown (lines 853-863)
- Make discipline dropdown always visible and editable
- Add `handleDisciplineChange` function with immediate save (similar to status updates)
- Use optimistic update pattern for instant UI feedback
- Add background sync with error rollback
- Display success notification on save

**Before** (lines 852-863):
```tsx
<label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Discipline</label>
{isEditMode ? (
    <select
        value={discipline}
        onChange={(e) => setDiscipline(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
    >
        {disciplineOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
) : (
    <p className="text-sm font-medium text-slate-900">{company.discipline || 'N/A'}</p>
)}
```

**After**:
```tsx
<label className="block text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Discipline</label>
<select
    value={discipline}
    onChange={(e) => handleDisciplineChange(e.target.value)}
    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400 transition-colors"
>
    {disciplineOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
</select>
```

---

### Issue #3: Duplicate "Assigned To" Information

**Problem**: The company details page shows assigned to information in two places:
1. Line 683: In the header badge area - `<span className="text-sm text-blue-100">Assigned to {company.pic || 'Unassigned'}</span>`
2. Lines 879-903: In the details grid at the bottom of the form

**Solution**: Remove the duplicate in the header since the details grid is more appropriate

#### [MODIFY] [companies/[id].tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)

**Changes**:
- Remove lines 683 (the header badge showing assigned to)
- Keep the details grid section (lines 879-903) which allows editing

**Before**:
```tsx
<span className="text-sm text-blue-100">Assigned to {company.pic || 'Unassigned'}</span>
```

**After**:
```tsx
// Removed - this information is shown in the details section below
```

---

### Issue #4: Display Previous Response Information

**Current State**: The `previousResponse` field (Column E in Outreach Tracker sheet) stores information about whether the company participated in previous years/events, but it's not visible on the Company Details page.

**Purpose**: This field helps committees decide whether to invite a company again based on their previous participation history.

**Solution**: Add a "Previous Participation" section in the company details page to display this information prominently.

#### [MODIFY] [Company Interface - companies/[id].tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)

**Changes to Interface** (around line 42):
```tsx
interface Company {
    id: string;
    companyName: string;
    name?: string;
    status: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    remark?: string;
    history?: any[];
    discipline?: string;
    priority?: string;
    followUpsCompleted?: number;
    lastCompanyActivity?: string;
    sponsorshipTier?: string;
    previousResponse?: string;  // ADD THIS LINE
}
```

**Changes to Details Tab**:
- Add new section after the sponsorship tier section (around line 760)
- Display `previousResponse` field if it has a value
- Show in an information card with icon
- Make it stand out visually as historical context

**UI Design**:
```tsx
{/* Previous Participation */}
{company.previousResponse && (
    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
                <ClockIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
                <label className="block text-sm font-semibold text-purple-900 mb-1">
                    Previous Participation
                </label>
                <p className="text-sm text-purple-800">
                    {company.previousResponse}
                </p>
                <p className="text-xs text-purple-600 mt-1">
                    Use this information to decide on re-invitation strategy
                </p>
            </div>
        </div>
    </div>
)}
```

**Location in Layout**: Place between "Company Response Date" and "Latest Remark" sections

---

#### [MODIFY] [Data Fetching - state initialization](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)

**Changes to State** (around lines 126-136):
- Ensure `previousResponse` is loaded from the company data
- Add state variable if needed: `const [previousResponse, setPreviousResponse] = useState('')`

**In fetchData function** (lines 126-136):
```tsx
if (found) {
    setCompany(found);
    setEditedName(found.companyName || found.name || '');
    setStatus(found.status);
    setIsFlagged(found.isFlagged);
    setDiscipline(found.discipline || '');
    setPriority(found.priority || '');
    setAssignedTo(found.pic || 'Unassigned');
    setFollowUpsCompleted(found.followUpsCompleted || 0);
    setLastCompanyActivity(found.lastCompanyActivity || found.lastUpdated || '');
    setSponsorshipTier(found.sponsorshipTier || '');
    setPreviousResponse(found.previousResponse || '');  // ADD THIS LINE
}
```

---

### Issue #5: Fix Discipline & Priority Data Mapping **CRITICAL BUG**

**Problem**: The database stores abbreviations (e.g., "CHE", "ME") but the UI dropdown expects full names (e.g., "Chemical Engineering", "Mechanical Engineering"). This causes:
- Display showing "CHE" but dropdown defaulting to first option ("Mechanical Engineering")
- Priority showing "N/A" but dropdown defaulting to "High"
- Data corruption when users save without realizing the wrong value is selected

**Root Cause**: No mapping layer between database format and UI format.

**Solution**: Create bidirectional mapping utilities to convert between abbreviations and full names.

#### [NEW] [lib/discipline-mapping.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/lib/discipline-mapping.ts)

**Purpose**: Centralized discipline mapping utility.

```typescript
// Map database abbreviations to full names
export const disciplineAbbrevToFull: Record<string, string> = {
    'ME': 'Mechanical Engineering',
    'EE': 'Electrical Engineering',
    'CHE': 'Chemical Engineering',
    'CE': 'Civil Engineering',
    'SE': 'Software Engineering',
    'BUS': 'Business / Marketing',
    'GEN': 'General',
};

// Map full names to database abbreviations
export const disciplineFullToAbbrev: Record<string, string> = {
    'Mechanical Engineering': 'ME',
    'Electrical Engineering': 'EE',
    'Chemical Engineering': 'CHE',
    'Civil Engineering': 'CE',
    'Software Engineering': 'SE',
    'Business / Marketing': 'BUS',
    'General': 'GEN',
};

// Dropdown options (full names)
export const disciplineOptions = [
    'Mechanical Engineering',
    'Electrical Engineering',
    'Chemical Engineering',
    'Civil Engineering',
    'Software Engineering',
    'Business / Marketing',
    'General',
];

// Convert database value to display value
export function disciplineToDisplay(dbValue: string | undefined): string {
    if (!dbValue) return '';
    return disciplineAbbrevToFull[dbValue] || dbValue; // Fallback to original if no mapping
}

// Convert display value to database value
export function disciplineToDatabase(displayValue: string | undefined): string {
    if (!displayValue) return '';
    return disciplineFullToAbbrev[displayValue] || displayValue; // Fallback to original if no mapping
}
```

---

#### [NEW] [lib/priority-mapping.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/lib/priority-mapping.ts)

**Purpose**: Centralized priority mapping utility.

```typescript
// Map database values to display values
export const priorityDbToDisplay: Record<string, string> = {
    'H': 'High',
    'M': 'Medium',
    'L': 'Low',
    '': '', // Empty maps to empty
};

// Map display values to database values
export const priorityDisplayToDb: Record<string, string> = {
    'High': 'H',
    'Medium': 'M',
    'Low': 'L',
    '': '', // Empty maps to empty
};

// Dropdown options (display names)
export const priorityOptions = ['High', 'Medium', 'Low'];

// Convert database value to display value
export function priorityToDisplay(dbValue: string | undefined): string {
    if (!dbValue || dbValue === 'N/A') return '';
    return priorityDbToDisplay[dbValue] || dbValue;
}

// Convert display value to database value
export function priorityToDatabase(displayValue: string | undefined): string {
    if (!displayValue) return '';
    return priorityDisplayToDb[displayValue] || displayValue;
}
```

---

#### [MODIFY] [companies/[id].tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)

**Changes**:

1. **Import mapping utilities** (top of file):
```typescript
import { disciplineToDisplay, disciplineToDatabase, disciplineOptions } from '../../lib/discipline-mapping';
import { priorityToDisplay, priorityToDatabase, priorityOptions } from '../../lib/priority-mapping';
```

2. **Remove local dropdown options** (delete lines 62-71):
```typescript
// DELETE THESE LINES:
const disciplineOptions = [
    'Mechanical Engineering',
    'Electrical Engineering',
    'Chemical Engineering',
    'Civil Engineering',
    'Software Engineering',
    'Business / Marketing',
    'General',
];
const priorityOptions = ['High', 'Medium', 'Low'];
```

3. **Convert on data load** (lines 126-136 in fetchData):
```typescript
if (found) {
    setCompany(found);
    setEditedName(found.companyName || found.name || '');
    setStatus(found.status);
    setIsFlagged(found.isFlagged);
    setDiscipline(disciplineToDisplay(found.discipline)); // CONVERT HERE
    setPriority(priorityToDisplay(found.priority));       // CONVERT HERE
    setAssignedTo(found.pic || 'Unassigned');
    setFollowUpsCompleted(found.followUpsCompleted || 0);
    setLastCompanyActivity(found.lastCompanyActivity || found.lastUpdated || '');
    setSponsorshipTier(found.sponsorshipTier || '');
}
```

4. **Convert on save** (lines 354-358 in handleSave):
```typescript
if (isEditMode) {
    updates.companyName = editedName;
    updates.discipline = disciplineToDatabase(discipline); // CONVERT HERE
    updates.priority = priorityToDatabase(priority);       // CONVERT HERE
    updates.pic = assignedTo;
}
```

5. **Convert in new handleDisciplineChange** (add new function):
```typescript
const handleDisciplineChange = async (newDiscipline: string) => {
    if (!company) return;
    
    const previousDiscipline = discipline;
    setDiscipline(newDiscipline); // Optimistic update
    
    const taskId = addTask(`Updating discipline...`);
    
    try {
        const res = await fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyId: company.id,
                updates: {
                    discipline: disciplineToDatabase(newDiscipline) // CONVERT HERE
                },
                user: currentUser
            })
        });
        
        if (res.ok) {
            fetchData();
            completeTask(taskId, 'Discipline updated successfully');
            showSuccess('Discipline updated!');
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        console.error('Failed to update discipline', error);
        failTask(taskId, 'Failed to update discipline');
        showError("Update Failed", "Could not save discipline change. Reverting...");
        setDiscipline(previousDiscipline); // Revert
    }
};
```

---

#### [MODIFY] [companies.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies.tsx)

**Changes**: Convert discipline for display in the companies list.

```typescript
import { disciplineToDisplay } from '../lib/discipline-mapping';

// In component (line 96):
const transformedCompanies = data.map(company => ({
    id: company.id,
    name: company.companyName || company.name || '',
    status: company.status,
    assignedTo: company.pic || 'Unassigned',
    contact: company.contacts?.map(c => c.name).filter(name => name && name.trim() !== '' && name !== 'N/A').join(', ') || '',
    email: company.contacts?.map(c => c.email).filter(Boolean).join(', ') || '',
    lastUpdated: company.lastUpdated || company.lastCompanyActivity || '',
    isFlagged: company.isFlagged,
    discipline: disciplineToDisplay(company.discipline) // CONVERT HERE
}));
```

---

#### [MODIFY] [AllCompaniesTable.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/components/AllCompaniesTable.tsx)

**No changes needed** - the discipline is already converted before being passed to this component.

---

## Verification Plan

### Automated Tests

1. **Add Company API Test**:
   ```bash
   # Test company creation
   curl -X POST http://localhost:3000/api/add-company \
     -H "Content-Type: application/json" \
     -d '{"companyName":"Test Corp","discipline":"Software Engineering","contact":{"name":"John Doe","email":"john@test.com"},"user":"Test User"}'
   ```

2. **Component Tests**:
   - Verify `AddCompanyModal` renders correctly
   - Test form validation (required fields)
   - Test success/error states

3. **UI Flow Tests** (using browser subagent):
   - Open All Companies page
   - Click "Add Company" button
   - Fill in form with valid data
   - Submit and verify company appears in list
   - Verify discipline can be changed
   - Verify only one "Assigned To" is visible
   - Verify previous response displays correctly

### Manual Verification

1. **Add Company Flow**:
   - Navigate to `/companies`
   - Click "Add Company" button
   - Fill in required fields (company name, discipline)
   - Add optional contact details
   - Submit and verify:
     - Company appears in table immediately (optimistic update)
     - Background task notification shows sync status
     - New company ID is generated correctly
     - Google Sheet is updated

2. **Discipline Change**:
   - Open company details page
   - Verify discipline dropdown is editable
   - Change discipline value
   - Verify change is saved successfully
   - Verify change reflects in All Companies list

3. **Assigned To Duplication Fix**:
   - Open any company details page
   - Verify "Assigned To" appears only ONCE (in the details grid section)
   - Verify it's NOT in the header badge area

4. **Previous Response Display**:
   - Open company with recent activity
   - Verify "Last Company Response" section is visible
   - Verify timestamp and "days ago" are accurate
   - Verify color coding matches the time elapsed
   - Test with companies at different response ages (recent, medium, stale)

5. **End-to-End Workflow**:
   - Add a new company with contact details
   - Navigate to company details
   - Update status, discipline, and other fields
   - Verify all changes persist
   - Check Google Sheet for data accuracy

6. **Edge Cases**:
   - Add company without contact details
   - Add company with partial contact details
   - Test with empty/whitespace company names (should fail validation)
   - Test discipline change with API errors (should revert)

7. **Issue #5 - Data Mapping**:
   - Open company with discipline="CHE" in database
   - Verify displays as "Chemical Engineering" in view mode
   - Click edit or change discipline dropdown
   - Verify "Chemical Engineering" is preselected (not "Mechanical Engineering")
   - Change to "Software Engineering"
   - Save and verify database has "SE" (not full name)
   - Repeat for priority field (H/M/L vs High/Medium/Low)
   - Test with companies that have empty/null discipline or priority
 