export const IMPERSONATION_COOKIE_NAME = 'outreach_impersonate_email';

function baseCookieAttrs() {
    const secure = process.env.NODE_ENV === 'production';
    return [
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        secure ? 'Secure' : null,
    ].filter(Boolean).join('; ');
}

export function buildImpersonationSetCookie(email: string) {
    const encoded = encodeURIComponent(email.trim().toLowerCase());
    // 7 days
    const maxAge = 60 * 60 * 24 * 7;
    return `${IMPERSONATION_COOKIE_NAME}=${encoded}; Max-Age=${maxAge}; ${baseCookieAttrs()}`;
}

export function buildImpersonationClearCookie() {
    return `${IMPERSONATION_COOKIE_NAME}=; Max-Age=0; ${baseCookieAttrs()}`;
}

export function readImpersonationEmailFromCookieHeader(cookieHeader: string | undefined | null) {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const [rawKey, ...rest] = part.split('=');
        const key = (rawKey || '').trim();
        if (key !== IMPERSONATION_COOKIE_NAME) continue;
        const rawVal = rest.join('=').trim();
        if (!rawVal) return null;
        try {
            return decodeURIComponent(rawVal);
        } catch {
            return rawVal;
        }
    }
    return null;
}

