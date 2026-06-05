import type { NextApiRequest, NextApiResponse } from 'next';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const levenshtein = require('fast-levenshtein') as { get: (a: string, b: string) => number };
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { requireEffectiveCanEditCompanies } from '../../lib/authz';

const SIMILARITY_THRESHOLD = 0.75;
const MAX_RESULTS = 5;

// Corporate suffixes to strip before comparing, ordered longest-first to avoid partial strips
const CORPORATE_SUFFIXES = [
    'sdn bhd', 'pte ltd', 'berhad', 'holdings', 'group', 'bhd', 'corp', 'ltd', 'inc',
];

function normalizeName(name: string): string {
    let n = name.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const suffix of CORPORATE_SUFFIXES) {
        const pattern = new RegExp(`\\b${suffix}\\b\\.?$`);
        n = n.replace(pattern, '').trim();
    }
    return n;
}

function similarity(a: string, b: string): number {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return 0;
    const dist = levenshtein.get(na, nb);
    return 1 - dist / Math.max(na.length, nb.length);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const name = (req.query.name as string | undefined)?.trim() ?? '';
    if (name.length < 2) {
        return res.status(200).json({ matches: [] });
    }

    // Try to reuse cached company data first
    let companies: { id: string; companyName: string }[] = [];

    const cached = cache.get('sheet_data') as { companies?: { id: string; companyName: string }[] } | undefined;
    if (cached?.companies) {
        companies = cached.companies
            .filter(c => c.id && c.companyName)
            .map(c => ({ id: c.id, companyName: c.companyName }));
    } else {
        // Fallback: fetch just columns A:B from the database sheet
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_1;
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const { title: sheetName } = getCompanyDatabaseSheet(metadata.data.sheets);
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:B`,
        });
        const rows = response.data.values || [];
        // Skip header row
        companies = rows.slice(1)
            .filter(row => row[0] && row[1])
            .map(row => ({ id: String(row[0]).trim(), companyName: String(row[1]).trim() }));
    }

    // Deduplicate by company ID (database has one row per contact)
    const seen = new Set<string>();
    const unique = companies.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
    });

    const matches = unique
        .map(c => ({ ...c, score: similarity(name, c.companyName) }))
        .filter(c => c.score >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map(c => ({ id: c.id, companyName: c.companyName, score: Math.round(c.score * 100) / 100 }));

    return res.status(200).json({ matches });
}
