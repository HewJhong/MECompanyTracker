# Active Contact Highlighting - Implementation

## Final Implementation Decision

**Approach: Hidden Is_Active Column with Conditional Formatting**

The user has decided to use a hidden TRUE/FALSE column (`Is_Active` at column N) combined with Google Sheets conditional formatting to display yellow highlighting visually.

---

## Schema Implementation

### Column N: Is_Active
- **Type**: Boolean (TRUE/FALSE)
- **Location**: Column N (index 13)
- **Visibility**: Hidden in Google Sheets UI
- **Purpose**: Drive conditional formatting rule for yellow background

### Google Sheets Setup

1. **Add Column N Header**: "Is_Active"
2. **Hide Column N**: Right-click column → Hide column
3. **Create Conditional Formatting Rule**:
   - Apply to range: `A2:M` (visible columns only)
   - Format cells if: `Custom formula is`
   - Formula: `=$N2=TRUE`
   - Background color: Yellow (`#FFFF00` or similar)
   - Click "Done"

**Result**: When a committee member sets `Is_Active=TRUE` in column N, the entire row (columns A-M) will automatically highlight in yellow.

---

## API Implementation

### Data Fetching (`data.ts`)

The API reads column N and maps it to the `isActive` boolean field:

```typescript
company.contacts.push({
    id: `contact-${companyId}-${index}`,
    rowNumber: index + 2,
    name: row[5],  // F: Company PIC
    role: row[6],  // G: Job title/position
    email: row[7], // H: Email
    phone: row[8], // I: Phone Number
    landline: row[9], // J: Landline Number
    linkedin: row[10], // K: LinkedIn
    remark: row[12], // M: Contact-specific remarks
    isActive: row[13] === 'TRUE' // N: Is_Active (hidden column)
});
```

### Frontend Display

The UI can use the `isActive` flag to:
- Display an "Active" badge next to contact names
- Filter/sort to show active contacts first
- Apply yellow background styling in the contact list (matching sheet appearance)

---

## Workflow

### For Committee Members:
1. Open the Company Database spreadsheet
2. Find the contact row to mark as active
3. Unhide column N (if needed for editing)
4. Set `Is_Active` to `TRUE` for active contacts
5. The row will automatically highlight in yellow (via conditional formatting)
6. Re-hide column N for clean appearance

### For the Application:
1. Fetch data from `/api/data`
2. Filter contacts with `isActive: true`
3. Display "Active" indicator in UI
4. Optionally apply yellow styling to match spreadsheet

---

## Benefits

✅ **Performance**: Simple TRUE/FALSE read (no grid data formatting API calls)
✅ **Visual Feedback**: Yellow highlighting visible in spreadsheet  
✅ **Simple Logic**: Conditional formatting handles color automatically  
✅ **Hidden Column**: Doesn't clutter the main view  
✅ **Reliable**: No color detection parsing needed

