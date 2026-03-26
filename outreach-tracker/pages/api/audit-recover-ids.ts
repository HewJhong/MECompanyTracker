import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

/** Normalize ID for consistent matching */
const normalizeId = (id: string) => id?.toString().trim().toUpperCase() || '';

/** Format ID to canonical "ME-0001" style (uppercase ME, 4-digit zero-padded) */
function formatId(id: string): string {
    const m = id?.toString().trim().match(/ME-(\d+)/i);
    if (!m) return normalizeId(id) || id;
    return `ME-${String(parseInt(m[1], 10)).padStart(4, '0')}`;
}

/** Normalize company name for comparison (lowercase, collapse whitespace) */
const normalizeName = (name: string) =>
    name?.toLowerCase().replace(/\s+/g, ' ').trim() || '';

/**
 * Parse RENUMBER and SYNC_ID_FIX entries to build oldId → currentId mapping.
 * IMPORTANT: We only use SYNC_ID_FIX (targeted ID heals from sync). We do NOT
 * use RENUMBER from Fix ID Gaps, because Fix ID Gaps affects ALL companies and
 * we have no independent log evidence for companies that were never in logs.
 * Using RENUMBER would blindly trust that mass renumber - we only translate
 * when we have targeted SYNC_ID_FIX from sync.
 */
function buildIdTranslationMap(logsRows: string[][]): Map<string, string> {
    const mapsInOrder: Array<Map<string, string>> = [];

    for (const row of logsRows) {
        const action = (row[2] || '').toString().trim();
        const data = row[4] ? String(row[4]) : '';

        if (action === 'SYNC_ID_FIX') {
            try {
                const arr = JSON.parse(data || '[]');
                if (!Array.isArray(arr)) continue;
                const m = new Map<string, string>();
                for (const item of arr) {
                    const oldId = item?.oldId ?? item?.old;
                    const newId = item?.newId ?? item?.new;
                    if (oldId && newId && normalizeId(oldId) !== normalizeId(newId)) {
                        m.set(normalizeId(oldId), normalizeId(newId));
                    }
                }
                if (m.size > 0) mapsInOrder.push(m);
            } catch {
                // ignore malformed JSON
            }
        }
    }

    const resolveToCurrent = (historicalId: string): string => {
        let current = normalizeId(historicalId);
        let changed = true;
        while (changed) {
            changed = false;
            for (const map of mapsInOrder) {
                const next = map.get(current);
                if (next && next !== current) {
                    current = next;
                    changed = true;
                }
            }
        }
        return current;
    };

    const composite = new Map<string, string>();
    const allHistoricalIds = new Set<string>();
    for (const map of mapsInOrder) {
        for (const oldId of map.keys()) allHistoricalIds.add(oldId);
    }
    for (const hid of allHistoricalIds) {
        const resolved = resolveToCurrent(hid);
        if (resolved !== normalizeId(hid)) composite.set(normalizeId(hid), resolved);
    }
    return composite;
}

/**
 * Extract ID → company name associations from log text.
 * Translates historical IDs to current IDs using RENUMBER/SYNC_ID_FIX so that
 * after Fix ID Gaps, old log entries still map correctly to current rows.
 */
function extractIdNameFromLogs(
    logsRows: string[][],
    idTranslation: Map<string, string>
): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();

    const add = (id: string, name: string) => {
        const n = name.trim();
        if (!n || n.length < 2) return;
        if (/^(added contact|deleted contact|updated contact|contact row)/i.test(n)) return;
        const historicalKey = normalizeId(id);
        const currentKey = idTranslation.get(historicalKey) || historicalKey;
        if (!map.has(currentKey)) map.set(currentKey, new Set());
        map.get(currentKey)!.add(/^ME-\d+$/i.test(n) ? formatId(n) : normalizeName(n));
    };

    const parenRe = /(ME-\d+)\s*\(\s*([^)]+)\s*\)/gi;
    const dashRe = /(ME-\d+)\s*[–\-]\s*([^;]+?)(?:\s*$|\s*;)/gi;

    for (const row of logsRows) {
        const action = (row[2] || '').toString().trim();
        const details = row[3] ? String(row[3]) : '';
        const data = row[4] ? String(row[4]) : '';

        let m: RegExpExecArray | null;

        if (action === 'COMPANY_UPDATE') {
            dashRe.lastIndex = 0;
            while ((m = dashRe.exec(details)) !== null) {
                add(m[1], m[2]);
            }
        }

        if (action === 'BULK_ASSIGN') {
            parenRe.lastIndex = 0;
            while ((m = parenRe.exec(data)) !== null) {
                add(m[1], m[2]);
            }
            parenRe.lastIndex = 0;
            while ((m = parenRe.exec(details)) !== null) {
                add(m[1], m[2]);
            }
        }
    }

    return map;
}

export interface MismatchEntry {
    rowIndex: number;
    currentId: string;
    currentName: string;
    expectedNamesFromLogs: string[];
    sourceCount: number;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const session = await getServerSession(req, res, authOptions);
        if (!session?.user?.email) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const members = await getCommitteeMembers();
        const userEmail = session.user.email.toLowerCase().trim();
        const user = members.find(m => m.email?.toLowerCase().trim() === userEmail);
        const roleLower = user?.role?.toLowerCase() || '';
        if (!user || roleLower !== 'superadmin') {
            return res.status(403).json({ message: 'Superadmin access required' });
        }

        const sheets = await getGoogleSheetsClient();
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
        if (!trackerSpreadsheetId) {
            return res.status(500).json({ message: 'Tracker spreadsheet not configured' });
        }

        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMeta.data.sheets?.[0]?.properties?.title;
        if (!trackerSheetName) {
            return res.status(500).json({ message: 'Tracker sheet not found' });
        }

        // 1. Fetch Logs_DoNotEdit
        let logsRows: string[][] = [];
        try {
            const logsRes = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Logs_DoNotEdit!A2:E',
            });
            logsRows = (logsRes.data.values || []) as string[][];
        } catch (e) {
            console.warn('Logs_DoNotEdit fetch failed:', e);
        }

        // 2. Build ID translation from SYNC_ID_FIX only (targeted heals). We do NOT use
        //    RENUMBER from Fix ID Gaps - that affects all companies and we have no
        //    independent log evidence for most of them.
        const idTranslation = buildIdTranslationMap(logsRows);
        const hasRenumberEntries = logsRows.some(r => (r[2] || '').toString().trim() === 'RENUMBER');

        // 3. Build audit map from logs (using translation so historical IDs map to current)
        const auditMap = extractIdNameFromLogs(logsRows, idTranslation);

        // 4. Fetch Companies (Tracker)
        const trackerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:B`,
        });
        const trackerRows = (trackerRes.data.values || []) as string[][];

        // 5. Find mismatches
        const mismatches: MismatchEntry[] = [];

        for (let i = 0; i < trackerRows.length; i++) {
            const row = trackerRows[i];
            const currentId = row[0]?.toString().trim() || '';
            const currentName = row[1]?.toString().trim() || '';
            if (!currentId) continue;

            const key = normalizeId(currentId);
            const expectedNames = auditMap.get(key);
            if (!expectedNames || expectedNames.size === 0) continue;

            const currentNameNorm = normalizeName(currentName);
            const matches = [...expectedNames].some(
                exp => exp === currentNameNorm || (exp && currentNameNorm && exp.includes(currentNameNorm)) || (currentNameNorm && exp && currentNameNorm.includes(exp))
            );
            if (matches) continue;

            mismatches.push({
                rowIndex: i + 2,
                currentId: formatId(currentId),
                currentName,
                expectedNamesFromLogs: [...expectedNames],
                sourceCount: expectedNames.size,
            });
        }

        // GET: return scan results only
        if (req.method === 'GET') {
            return res.status(200).json({
                success: true,
                mismatches,
                auditMapSize: auditMap.size,
                companiesScanned: trackerRows.length,
                hasRenumberEntries,
                warning: hasRenumberEntries
                    ? 'Fix ID Gaps was run. Audit only considers companies with direct log entries (COMPANY_UPDATE, BULK_ASSIGN). Renumber mapping is not used to avoid trusting mass changes without independent evidence.'
                    : undefined,
            });
        }

        // POST: apply corrections
        const { corrections } = req.body as { corrections?: Array<{ rowIndex: number; newName: string }> };
        if (!Array.isArray(corrections) || corrections.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing or empty corrections array. Provide { corrections: [{ rowIndex, newName }, ...] }',
            });
        }

        // Validate: each correction must be for a detected mismatch
        const mismatchByRow = new Map(mismatches.map(m => [m.rowIndex, m]));
        const validCorrections: Array<{ rowIndex: number; newName: string; currentId: string }> = [];

        for (const c of corrections) {
            const m = mismatchByRow.get(c.rowIndex);
            if (!m) continue;
            const nameNorm = normalizeName(c.newName);
            const isExpected = m.expectedNamesFromLogs.some(exp => {
                if (/^ME-\d+$/i.test(exp)) {
                    return formatId(c.newName) === exp;
                }
                return exp === nameNorm || (exp && nameNorm && exp.includes(nameNorm)) || (nameNorm && exp && nameNorm.includes(exp));
            });
            if (isExpected) {
                validCorrections.push({
                    rowIndex: c.rowIndex,
                    newName: /^ME-\d+$/i.test(c.newName) ? formatId(c.newName) : c.newName,
                    currentId: m.currentId,
                });
            }
        }

        if (validCorrections.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid corrections. Each correction must target a mismatch row with an expected name from logs.',
            });
        }

        // Fetch full rows for update (we need to update column B only)
        const fullRes = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:P`,
        });
        const fullRows = (fullRes.data.values || []) as string[][];

        const updates: Array<{ range: string; values: string[][] }> = [];
        for (const c of validCorrections) {
            const rowArr = fullRows[c.rowIndex - 2] || [];
            const updatedRow = [...rowArr];
            while (updatedRow.length < 16) updatedRow.push('');
            updatedRow[1] = c.newName; // Column B = Company Name
            updates.push({
                range: `${trackerSheetName}!A${c.rowIndex}:P${c.rowIndex}`,
                values: [updatedRow.slice(0, 16)],
            });
        }

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: trackerSpreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updates,
            },
        });

        cache.delete('sheet_data');

        // Append to Logs_DoNotEdit and Thread_History
        const actorName = user?.name || user?.email || session?.user?.email || 'AuditRecovery';
        const now = new Date().toISOString();
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Logs_DoNotEdit!A:E',
            valueInputOption: 'RAW',
            requestBody: {
                values: [[
                    now,
                    actorName,
                    'AUDIT_RECOVERY',
                    `Corrected ${validCorrections.length} company names using logs audit trail`,
                    JSON.stringify(validCorrections.map(c => ({ rowIndex: c.rowIndex, id: formatId(c.currentId), newName: c.newName }))),
                ]],
            },
        });
        const threadRows = validCorrections.map(c => [now, c.currentId, actorName, `Audit recovery: corrected name to "${c.newName}"`]);
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Thread_History!A:D',
            valueInputOption: 'RAW',
            requestBody: { values: threadRows },
        });

        return res.status(200).json({
            success: true,
            applied: validCorrections.length,
            corrections: validCorrections,
        });
    } catch (error) {
        console.error('Audit recover IDs error:', error);
        return res.status(500).json({
            success: false,
            message: (error as Error).message || 'Internal Server Error',
        });
    }
}
