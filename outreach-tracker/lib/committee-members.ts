import { getGoogleSheetsClient } from './google-sheets';
import { cache } from './cache';

const CACHE_KEY = 'committee_members';
const SHEET_NAME = 'Committee_Members';

export interface CommitteeMember {
    name: string;
    email: string;
    role: string;
}

export async function getCommitteeMembers(): Promise<CommitteeMember[]> {
    const cached = cache.get(CACHE_KEY) as CommitteeMember[] | undefined;
    if (cached) return cached;

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_2 || process.env.SPREADSHEET_ID_1 || process.env.SPREADSHEET_ID;
        if (!spreadsheetId) throw new Error('No SPREADSHEET_ID configured');

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${SHEET_NAME}!A2:C`,
        });
        const rows = response.data.values || [];
        const members: CommitteeMember[] = rows
            .filter((row) => row[0])
            .map((row) => ({
                name: String(row[0] || '').trim(),
                email: String(row[1] || '').trim(),
                role: String(row[2] || '').trim() || 'Committee Member',
            }));
        cache.set(CACHE_KEY, members);
        return members;
    } catch (error) {
        console.warn('Committee_Members sheet not found or empty:', error);
        return [];
    }
}

export function findRoleByNameOrEmail(
    members: CommitteeMember[],
    name?: string,
    email?: string
): string | null {
    if (!name && !email) return null;
    const n = (name || '').trim().toLowerCase();
    const e = (email || '').trim().toLowerCase();
    const found = members.find(
        (m) =>
            m.name.toLowerCase() === n ||
            m.email.toLowerCase() === e ||
            (n && m.name.toLowerCase().includes(n)) ||
            (e && m.email.toLowerCase().includes(e))
    );
    return found ? found.role : null;
}
