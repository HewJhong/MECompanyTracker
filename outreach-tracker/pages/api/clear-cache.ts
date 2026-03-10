import type { NextApiRequest, NextApiResponse } from 'next';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        // Clear the cache
        cache.clear();

        return res.status(200).json({
            message: 'Cache cleared successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Cache clear error:', error);
        return res.status(500).json({ message: 'Failed to clear cache' });
    }
}
