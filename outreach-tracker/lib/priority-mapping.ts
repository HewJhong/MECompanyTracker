/**
 * Priority Mapping Utilities
 * 
 * This file provides bidirectional mapping between database abbreviations
 * and user-friendly display names for company priority levels.
 * 
 * ⚠️ CUSTOMIZATION POINT:
 * To change the priority abbreviations or add new priority levels:
 * 1. Update both `priorityDbToDisplay` and `priorityDisplayToDb` maps
 * 2. Update the `priorityOptions` array
 * 3. Ensure the mappings are symmetric (each abbreviation maps to exactly one full name)
 */

// ============================================================================
// 📝 EDIT HERE: Map database values to full display names
// ============================================================================
export const priorityDbToDisplay: Record<string, string> = {
    'Prioritised': 'Gold',
    'Gold Sponsors': 'Gold',
    'Official Partner': 'Official Partner',
    'Gold': 'Gold',
    'Silver': 'Silver',
    'Bronze': 'Bronze',
    '': '',
};

// ============================================================================
// 📝 EDIT HERE: Map full display names to database values
// ============================================================================
export const priorityDisplayToDb: Record<string, string> = {
    'Official Partner': 'Official Partner',
    'Gold': 'Gold',
    'Silver': 'Silver',
    'Bronze': 'Bronze',
    '': '',
};

// ============================================================================
// 📝 EDIT HERE: Dropdown options
// ============================================================================
export const priorityOptions = ['Official Partner', 'Gold', 'Silver', 'Bronze'];

// ============================================================================
// Helper Functions (DO NOT EDIT unless changing logic)
// ============================================================================

/**
 * Convert database abbreviation to display name
 * @param dbValue - Database value (e.g., "H")
 * @returns Display name (e.g., "High")
 */
export function priorityToDisplay(dbValue: string | undefined): string {
    if (!dbValue || dbValue === 'N/A') return '';
    return priorityDbToDisplay[dbValue] || dbValue;
}

/**
 * Convert display name to database abbreviation
 * @param displayValue - Display value (e.g., "High")
 * @returns Database abbreviation (e.g., "H")
 */
export function priorityToDatabase(displayValue: string | undefined): string {
    if (!displayValue) return '';
    return priorityDisplayToDb[displayValue] || displayValue;
}
