import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export function requireApiKey(req: NextApiRequest, res: NextApiResponse): boolean {
    const configuredKey = process.env.COMPANIES_API_KEY;

    if (!configuredKey) {
        res.status(503).json({ error: 'API not configured', code: 'API_KEY_NOT_CONFIGURED' });
        return false;
    }

    const provided = req.headers['x-api-key'];
    if (!provided || typeof provided !== 'string') {
        res.status(401).json({ error: 'Missing API key', code: 'MISSING_API_KEY' });
        return false;
    }

    let valid = false;
    try {
        const a = Buffer.from(configuredKey);
        const b = Buffer.from(provided);
        valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        valid = false;
    }

    if (!valid) {
        res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
        return false;
    }

    return true;
}

export function getApiActorLabel(req: NextApiRequest): string {
    const key = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '';
    return `API:${key.substring(0, 8)}`;
}
