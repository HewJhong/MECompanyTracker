/**
 * Utilities for canonical sheet selection.
 * Avoids ambiguous matches when multiple sheets contain "[AUTOMATION ONLY]".
 *
 * Source of truth: The company database sheet has "[AUTOMATION ONLY]" in its name
 * but is NOT "[AUTOMATION ONLY] Compiled Company List". We use an exact allowlist
 * and exclude the Compiled Company List to avoid selecting the wrong sheet.
 */

const COMPILED_COMPANY_LIST = '[AUTOMATION ONLY] Compiled Company List';

/**
 * Preferred sheet titles for the company database (in order of preference).
 * The first matching sheet wins.
 */
const PREFERRED_COMPANY_DB_NAMES = [
    '[AUTOMATION ONLY] Outreach Tracker',
    '[AUTOMATION ONLY] Company Database',
    '[AUTOMATION ONLY] Compiled Company List', // Used as main company DB in some setups
    '[AUTOMATION ONLY]', // Fallback: any sheet with exactly this name
];

/**
 * Get the canonical company database sheet from metadata.
 * Excludes "[AUTOMATION ONLY] Compiled Company List" - that sheet is for archival,
 * not the main company database.
 * Accepts Google Sheets API Schema$Sheet[] structure.
 *
 * @throws Error if no unique match or sheet not found
 */
export function getCompanyDatabaseSheet(
    sheets: Array<{ properties?: { title?: string | null; sheetId?: number | null } }> | null | undefined
): { title: string; sheetId?: number } {
    if (!sheets || sheets.length === 0) {
        throw new Error('No sheets in spreadsheet');
    }

    // First try exact preferred names
    for (const preferred of PREFERRED_COMPANY_DB_NAMES) {
        const match = sheets.find(s => (s.properties?.title ?? '') === preferred);
        const t = match?.properties?.title;
        if (t) {
            const sid = match?.properties?.sheetId;
            return {
                title: String(t),
                sheetId: sid != null ? sid : undefined,
            };
        }
    }

    // Fallback: sheets with [AUTOMATION ONLY] that are NOT the Compiled Company List
    const candidates = (sheets || []).filter(s => {
        const title = (s.properties?.title ?? '') || '';
        if (title === COMPILED_COMPANY_LIST) return false;
        return title.includes('[AUTOMATION ONLY]');
    });

    if (candidates.length === 0) {
        throw new Error(
            `Company Database sheet not found. Expected a sheet with "[AUTOMATION ONLY]" in the title ` +
            `(excluding "${COMPILED_COMPANY_LIST}").`
        );
    }
    if (candidates.length > 1) {
        const names = candidates.map(c => c.properties?.title ?? '').join(', ');
        throw new Error(
            `Ambiguous company database sheet: multiple matches [${names}]. ` +
            `Add an exact preferred name in spreadsheet-utils.ts or rename sheets.`
        );
    }

    const sheet = candidates[0];
    const title = (sheet.properties?.title ?? '') || '';
    if (!title) throw new Error('Company Database sheet has no title');
    const sid = sheet.properties?.sheetId;
    return {
        title,
        sheetId: sid != null ? sid : undefined,
    };
}
