import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next"
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { buildImpersonationClearCookie, readImpersonationEmailFromCookieHeader } from '../../lib/impersonation-cookie';

export interface MeUserIdentity {
    name: string | null;
    email: string | null;
    role: string | null;
    isCommitteeMember: boolean;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    canEditCompanies: boolean;
}

export interface MeResponse {
    authenticated: boolean;
    isImpersonating: boolean;
    impersonatedEmail: string | null;
    realUser: MeUserIdentity | null;
    effectiveUser: MeUserIdentity | null;

    // Backwards-compatible top-level fields (mirrors effectiveUser)
    name: string | null;
    email: string | null;
    role: string | null;
    isCommitteeMember: boolean;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    canEditCompanies: boolean;
}

function roleFlagsFromRole(roleLower: string) {
    const isSuperAdmin = roleLower === 'superadmin';
    const isAdmin = roleLower === 'admin' || isSuperAdmin;
    const canEditCompanies = isAdmin || roleLower === 'member' || roleLower === 'committee member';
    return { isSuperAdmin, isAdmin, canEditCompanies };
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<MeResponse>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            authenticated: false,
            isImpersonating: false,
            impersonatedEmail: null,
            realUser: null,
            effectiveUser: null,

            name: null,
            email: null,
            role: null,
            isCommitteeMember: false,
            isAdmin: false,
            isSuperAdmin: false,
            canEditCompanies: false,
        });
    }

    try {
        const session = await getServerSession(req, res, authOptions);

        // If no session, return unauthenticated
        if (!session || !session.user || !session.user.email) {
            return res.status(200).json({
                authenticated: false,
                isImpersonating: false,
                impersonatedEmail: null,
                realUser: null,
                effectiveUser: null,

                name: null,
                email: null,
                role: null,
                isCommitteeMember: false,
                isAdmin: false,
                isSuperAdmin: false,
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

        const realRoleLower = committeeMember?.role?.toLowerCase().trim() || '';
        const realFlags = roleFlagsFromRole(realRoleLower);
        const realUser: MeUserIdentity = {
            name: committeeMember?.name || session.user.name || null,
            email: committeeMember?.email || session.user.email || null,
            role: committeeMember?.role || null,
            isCommitteeMember: Boolean(committeeMember),
            isAdmin: Boolean(committeeMember) && realFlags.isAdmin,
            isSuperAdmin: Boolean(committeeMember) && realFlags.isSuperAdmin,
            canEditCompanies: Boolean(committeeMember) && realFlags.canEditCompanies,
        };

        let isImpersonating = false;
        let impersonatedEmail: string | null = null;
        let effectiveMember = committeeMember || null;

        // SuperAdmin can impersonate any listed member via HttpOnly cookie
        if (realUser.isSuperAdmin) {
            const cookieEmail = readImpersonationEmailFromCookieHeader(req.headers.cookie);
            if (cookieEmail) {
                const targetEmail = cookieEmail.toLowerCase().trim();
                const targetMember = members.find(m => m.email.toLowerCase().trim() === targetEmail) || null;
                if (targetMember) {
                    isImpersonating = true;
                    impersonatedEmail = targetMember.email;
                    effectiveMember = targetMember;
                } else {
                    // Stale/invalid cookie — clear it proactively.
                    res.setHeader('Set-Cookie', buildImpersonationClearCookie());
                }
            }
        }

        const effectiveRoleLower = effectiveMember?.role?.toLowerCase().trim() || '';
        const effectiveFlags = roleFlagsFromRole(effectiveRoleLower);
        const effectiveUser: MeUserIdentity = {
            name: effectiveMember?.name || session.user.name || null,
            email: effectiveMember?.email || session.user.email || null,
            role: effectiveMember?.role || null,
            isCommitteeMember: Boolean(effectiveMember),
            isAdmin: Boolean(effectiveMember) && effectiveFlags.isAdmin,
            isSuperAdmin: Boolean(effectiveMember) && effectiveFlags.isSuperAdmin,
            canEditCompanies: Boolean(effectiveMember) && effectiveFlags.canEditCompanies,
        };

        return res.status(200).json({
            authenticated: true,
            isImpersonating,
            impersonatedEmail,
            realUser,
            effectiveUser,

            name: effectiveUser.name,
            email: effectiveUser.email,
            role: effectiveUser.role,
            isCommitteeMember: effectiveUser.isCommitteeMember,
            isAdmin: effectiveUser.isAdmin,
            isSuperAdmin: realUser.isSuperAdmin,
            canEditCompanies: effectiveUser.canEditCompanies,
        });
    } catch (error) {
        console.error('Error in /api/me:', error);
        return res.status(500).json({
            authenticated: false,
            isImpersonating: false,
            impersonatedEmail: null,
            realUser: null,
            effectiveUser: null,

            name: null,
            email: null,
            role: null,
            isCommitteeMember: false,
            isAdmin: false,
            isSuperAdmin: false,
            canEditCompanies: false,
        });
    }
}
