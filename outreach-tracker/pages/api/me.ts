import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommitteeMembers, findRoleByNameOrEmail } from '../../lib/committee-members';

export interface MeResponse {
    name: string;
    email: string;
    role: string;
    source: 'env' | 'sheet';
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<MeResponse | { message: string }>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const name = process.env.NEXT_PUBLIC_CURRENT_USER_NAME || '';
    const email = process.env.NEXT_PUBLIC_CURRENT_USER_EMAIL || '';
    const roleFromEnv = process.env.NEXT_PUBLIC_CURRENT_USER_ROLE || '';

    let role = roleFromEnv;
    let source: 'env' | 'sheet' = 'env';

    if (!role) {
        const members = await getCommitteeMembers();
        const roleFromSheet = findRoleByNameOrEmail(members, name, email);
        if (roleFromSheet) {
            role = roleFromSheet;
            source = 'sheet';
        } else {
            role = 'Committee Member';
        }
    }

    res.status(200).json({
        name: name || 'Guest',
        email: email || '',
        role: role || 'Committee Member',
        source,
    });
}
