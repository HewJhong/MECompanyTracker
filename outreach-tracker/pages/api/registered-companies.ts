import type { NextApiRequest, NextApiResponse } from 'next';
import { loadSheetData } from '../../lib/sheet-data';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const refresh = req.query.refresh === 'true';
    console.log('>>> [API REGISTERED COMPANIES] Request started');
    const result = await loadSheetData({ refresh });

    if (!result.ok) {
        return res.status(result.status).json({
            message: result.message,
            ...(result.code ? { code: result.code } : {}),
        });
    }

    const companies = result.payload.companies.filter(
        (c) => c.relationshipStatus === 'Registered' && !c.isDeleted
    );

    res.setHeader('X-Cache', result.cacheStatus);
    if (result.cacheStatus === 'STALE') {
        res.setHeader('X-Sheets-Quota-Fallback', '1');
    }
    return res.status(200).json({
        companies,
        count: companies.length,
    });
}
