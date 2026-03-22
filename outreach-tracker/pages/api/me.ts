import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next"
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';

export interface MeResponse {
    name: string | null;
    email: string | null;
    role: string | null;
    authenticated: boolean;
    isCommitteeMember: boolean;
    isAdmin: boolean;
    canEditCompanies: boolean;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<MeResponse>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            name: null,
            email: null,
            role: null,
            authenticated: false,
            isCommitteeMember: false,
            isAdmin: false,
            canEditCompanies: false,
        });
    }

    try {
        const session = await getServerSession(req, res, authOptions);

        // If no session, return unauthenticated
        if (!session || !session.user || !session.user.email) {
            return res.status(200).json({
                name: null,
                email: null,
                role: null,
                authenticated: false,
                isCommitteeMember: false,
                isAdmin: false,
                canEditCompanies: false,
            });
        }

        // Fetch committee members from sheet
        const members = await getCommitteeMembers();

        // Find user in committee members by email
        const userEmail = session.user.email.toLowerCase().trim();
        const committeeMember = members.find(
            m => m.email.toLowerCase().trim() === userEmail
        );

        if (committeeMember) {
            const roleLower = committeeMember.role?.toLowerCase() || '';
            const isAdmin = roleLower === 'admin' || roleLower === 'superadmin';
            const canEditCompanies = isAdmin || roleLower === 'member' || roleLower === 'committee member';

            // User is in Committee_Members sheet
            return res.status(200).json({
                name: committeeMember.name,
                email: committeeMember.email,
                role: committeeMember.role,
                authenticated: true,
                isCommitteeMember: true,
                isAdmin,
                canEditCompanies,
            });
        }

        // User is authenticated but not in Committee_Members sheet
        return res.status(200).json({
            name: session.user.name || null,
            email: session.user.email || null,
            role: null,
            authenticated: true,
            isCommitteeMember: false,
            isAdmin: false,
            canEditCompanies: false,
        });
    } catch (error) {
        console.error('Error in /api/me:', error);
        return res.status(500).json({
            name: null,
            email: null,
            role: null,
            authenticated: false,
            isCommitteeMember: false,
            isAdmin: false,
            canEditCompanies: false,
        });
    }
}
