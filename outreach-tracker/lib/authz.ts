import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth';
import { getCommitteeMembers, type CommitteeMember } from './committee-members';
import { readImpersonationEmailFromCookieHeader } from './impersonation-cookie';
import { buildImpersonationClearCookie } from './impersonation-cookie';

export type RoleLower = 'admin' | 'member' | 'committee member' | 'superadmin' | string;

export interface AuthzContext {
    members: CommitteeMember[];
    sessionEmail: string;
    sessionNameOrEmail: string;
    realMember: CommitteeMember | null;
    realRoleLower: RoleLower;
    isRealSuperAdmin: boolean;
    effectiveMember: CommitteeMember | null;
    effectiveRoleLower: RoleLower;
    effectiveEmail: string;
    isImpersonating: boolean;
    impersonatedEmail: string | null;
}

export async function getAuthzContext(req: NextApiRequest, res: NextApiResponse): Promise<AuthzContext | null> {
    const session = await getServerSession(req, res, authOptions);
    const sessionEmail = session?.user?.email?.toLowerCase().trim();
    if (!sessionEmail) return null;

    const members = await getCommitteeMembers();
    const realMember = members.find(m => m.email.toLowerCase().trim() === sessionEmail) || null;
    const realRoleLower = (realMember?.role || '').toLowerCase().trim();
    const isRealSuperAdmin = realRoleLower === 'superadmin';

    let effectiveMember: CommitteeMember | null = realMember;
    let isImpersonating = false;
    let impersonatedEmail: string | null = null;
    if (isRealSuperAdmin) {
        const cookieEmail = readImpersonationEmailFromCookieHeader(req.headers.cookie);
        if (cookieEmail) {
            const targetEmail = cookieEmail.toLowerCase().trim();
            const targetMember = members.find(m => m.email.toLowerCase().trim() === targetEmail) || null;
            if (targetMember) {
                effectiveMember = targetMember;
                isImpersonating = true;
                impersonatedEmail = targetMember.email;
            } else {
                // Stale/invalid cookie — clear it proactively for consistency.
                res.setHeader('Set-Cookie', buildImpersonationClearCookie());
            }
        }
    }

    const effectiveRoleLower = (effectiveMember?.role || '').toLowerCase().trim();
    const effectiveEmail = effectiveMember?.email?.toLowerCase().trim() || sessionEmail;
    const sessionNameOrEmail = session?.user?.name || session?.user?.email || sessionEmail;

    return {
        members,
        sessionEmail,
        sessionNameOrEmail,
        realMember,
        realRoleLower,
        isRealSuperAdmin,
        effectiveMember,
        effectiveRoleLower,
        effectiveEmail,
        isImpersonating,
        impersonatedEmail,
    };
}

export function isEffectiveAdmin(ctx: AuthzContext) {
    return ctx.effectiveRoleLower === 'admin' || ctx.effectiveRoleLower === 'superadmin';
}

export function canEffectiveEditCompanies(ctx: AuthzContext) {
    const r = ctx.effectiveRoleLower;
    return r === 'admin' || r === 'superadmin' || r === 'member' || r === 'committee member';
}

function bestMemberLabel(m: CommitteeMember | null, fallback?: string) {
    const name = m?.name?.trim();
    const email = m?.email?.trim();
    return name || email || fallback || 'Unknown';
}

export function formatActorLabel(ctx: AuthzContext) {
    const effective = bestMemberLabel(ctx.effectiveMember, ctx.sessionNameOrEmail);
    if (!ctx.isImpersonating) return effective;
    const real = bestMemberLabel(ctx.realMember, ctx.sessionNameOrEmail);
    const imp = ctx.impersonatedEmail || ctx.effectiveMember?.email || 'Unknown';
    return `${effective} (impersonated by ${real}; target=${imp})`;
}

export async function requireAuthzContext(req: NextApiRequest, res: NextApiResponse) {
    const ctx = await getAuthzContext(req, res);
    if (!ctx) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return ctx;
}

export async function requireEffectiveAdmin(req: NextApiRequest, res: NextApiResponse) {
    const ctx = await requireAuthzContext(req, res);
    if (!ctx) return null;
    if (!ctx.effectiveMember || !isEffectiveAdmin(ctx)) {
        res.status(403).json({ error: 'Admin access required' });
        return null;
    }
    return ctx;
}

export async function requireEffectiveCanEditCompanies(req: NextApiRequest, res: NextApiResponse) {
    const ctx = await requireAuthzContext(req, res);
    if (!ctx) return null;
    if (!ctx.effectiveMember || !canEffectiveEditCompanies(ctx)) {
        res.status(403).json({ message: 'Not authorized to modify data' });
        return null;
    }
    return ctx;
}

