/**
 * Discipline Mapping Utilities
 * 
 * This file provides bidirectional mapping between database abbreviations
 * and user-friendly display names for company disciplines.
 * 
 * ⚠️ CUSTOMIZATION POINT:
 * To change the discipline abbreviations or add new disciplines:
 * 1. Update both `disciplineAbbrevToFull` and `disciplineFullToAbbrev` maps
 * 2. Update the `disciplineOptions` array
 * 3. Ensure the mappings are symmetric (each abbreviation maps to exactly one full name)
 */

// ============================================================================
// 📝 EDIT HERE: Map database abbreviations to full display names
// ============================================================================
export const disciplineAbbrevToFull: Record<string, string> = {
    'MEC': 'Mechanical Engineering',
    'ECSE': 'Electrical and Computer Systems Engineering',
    'CHE': 'Chemical Engineering',
    'CIV': 'Civil Engineering',
    'SE': 'Software Engineering',
    'TRC': 'Robotics and Mechatronics Engineering',
    'CS': 'Computer Science',
    'DS': 'Data Science',
    'AI': 'Artificial Intelligence',
};

// ============================================================================
// 📝 EDIT HERE: Map full display names to database abbreviations
// ============================================================================
export const disciplineFullToAbbrev: Record<string, string> = {
    'Mechanical Engineering': 'MEC',
    'Electrical and Computer Systems Engineering': 'ECSE',
    'Chemical Engineering': 'CHE',
    'Civil Engineering': 'CIV',
    'Software Engineering': 'SE',
    'Robotics and Mechatronics Engineering': 'TRC',
    'Computer Science': 'CS',
    'Data Science': 'DS',
    'Artificial Intelligence': 'AI',
};

// ============================================================================
// 📝 EDIT HERE: Dropdown options (must match the full names above)
// ============================================================================
export const disciplineOptions = [
    'Mechanical Engineering',
    'Electrical and Computer Systems Engineering',
    'Chemical Engineering',
    'Civil Engineering',
    'Software Engineering',
    'Robotics and Mechatronics Engineering',
    'Computer Science',
    'Data Science',
    'Artificial Intelligence',
];

// ============================================================================
// Helper Functions (DO NOT EDIT unless changing logic)
// ============================================================================

/**
 * Convert database abbreviation to display name
 * Supports comma-separated multiple values
 * @param dbValue - Database value (e.g., "CHE, MEC")
 * @returns Display name (e.g., "Chemical Engineering, Mechanical Engineering")
 */
export function disciplineToDisplay(dbValue: string | undefined): string {
    if (!dbValue) return '';
    return dbValue.split(',')
        .map(val => val.trim())
        .filter(Boolean)
        .map(val => disciplineAbbrevToFull[val] || val)
        .join(', ');
}

/**
 * Convert display name to database abbreviation
 * Supports comma-separated multiple values
 * @param displayValue - Display value (e.g., "Chemical Engineering, Mechanical Engineering")
 * @returns Database abbreviation (e.g., "CHE, MEC")
 */
export function disciplineToDatabase(displayValue: string | undefined): string {
    if (!displayValue) return '';
    return displayValue.split(',')
        .map(val => val.trim())
        .filter(Boolean)
        .map(val => disciplineFullToAbbrev[val] || val)
        .join(', ');
}
