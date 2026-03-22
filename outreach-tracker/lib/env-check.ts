/**
 * Centralized environment validation.
 * Call early in lib/google-sheets.ts and other entry points so misconfiguration fails fast
 * with one clear error message.
 */

const REQUIRED_KEYS = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
] as const;

const SPREADSHEET_KEYS = ['SPREADSHEET_ID_1', 'SPREADSHEET_ID_2'] as const;

/** Validates required auth and spreadsheet env vars. Throws if any are missing. */
export function validateEnv(): void {
    const missing: string[] = [];
    for (const key of REQUIRED_KEYS) {
        const v = process.env[key];
        if (!v || (typeof v === 'string' && !v.trim())) {
            missing.push(key);
        }
    }
    const hasSpreadsheet =
        (process.env.SPREADSHEET_ID_1 || process.env.SPREADSHEET_ID_2 || process.env.SPREADSHEET_ID);
    if (!hasSpreadsheet) {
        missing.push('SPREADSHEET_ID_1 or SPREADSHEET_ID_2 or SPREADSHEET_ID');
    }
    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}. ` +
            'Configure GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and at least one SPREADSHEET_ID.'
        );
    }
}
