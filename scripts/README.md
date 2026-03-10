# Migration Script

This script migrates data from your existing main list to the new two-sheet architecture.

## What It Does

1. **Reads** all rows from the main list (SPREADSHEET_ID_1)
2. **Groups** contacts by company name (since multiple rows may exist per company)
3. **Generates** Company IDs in format ME-0001, ME-0002, etc.
4. **Extracts** outreach-related fields for each unique company:
   - Status
   - Assigned PIC
   - Follow-up count
   - Remarks
   - Last update timestamp
5. **Writes** one row per company to Outreach Tracker (SPREADSHEET_ID_2)

## Running the Script

```bash
cd "/Users/jinhong/Documents/My Projects/ME Company Tracker"
npx ts-node scripts/migrate-to-outreach-tracker.ts
```

## What Gets Migrated

The script maps fields from your existing main sheet:
- **Column B** (Company Name) → Company Name
- **Column E** (Status) → Status
- **Column M** (Remark) → Remarks
- **Column N** (PIC) → Assigned PIC
- **Column O** (Last Updated) → Last Update & Last Contact
- **Column Q** (Follow Ups Completed) → Follow-up Count

## After Migration

1. Review the Outreach Tracker sheet
2. Verify Company IDs are assigned correctly
3. The Company Database (SPREADSHEET_ID_1) remains unchanged - you'll need to manually add Company IDs to match
4. Test the `/api/data` endpoint

## Safety

- The script **clears existing data** in the Outreach Tracker before writing
- The main list (SPREADSHEET_ID_1) is **read-only** - not modified
- You can re-run the script if needed
