import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getCommitteeMembers } from '../../../lib/committee-members';
import { buildImpersonationClearCookie } from '../../../lib/impersonation-cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    const realEmail = session?.user?.email?.toLowerCase().trim();
    if (!realEmail) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const members = await getCommitteeMembers();
    const realMember = members.find(m => m.email.toLowerCase().trim() === realEmail);
    const realRole = realMember?.role?.toLowerCase().trim() || '';
    if (realRole !== 'superadmin') {
        return res.status(403).json({ error: 'SuperAdmin access required' });
    }

    res.setHeader('Set-Cookie', buildImpersonationClearCookie());
    return res.status(200).json({ success: true });
}

