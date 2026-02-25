import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommitteeMembers } from '../../lib/committee-members';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const members = await getCommitteeMembers();
        return res.status(200).json({ members });
    } catch (error) {
        console.error('Error fetching committee members:', error);
        return res.status(500).json({ error: 'Failed to fetch members' });
    }
}
