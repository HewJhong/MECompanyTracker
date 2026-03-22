import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface CurrentUser {
    name: string | null;
    email: string | null;
    role: string | null;
    isCommitteeMember: boolean;
    isAdmin: boolean;
    canEditCompanies: boolean;
}

export interface RealUser extends CurrentUser {
    isSuperAdmin: boolean;
}

interface CurrentUserContextValue {
    // Backwards-compatible: this is the *effective* user (impersonated when active).
    user: CurrentUser | null;
    // Real signed-in identity (never changes during impersonation).
    realUser: RealUser | null;
    // Effective identity (same as `user`, exposed explicitly for clarity).
    effectiveUser: CurrentUser | null;
    isImpersonating: boolean;
    impersonatedEmail: string | null;

    loading: boolean;
    refetch: () => void;
    startImpersonation: (impersonatedEmail: string) => Promise<boolean>;
    stopImpersonation: () => Promise<boolean>;
}

const CurrentUserContext = createContext<CurrentUserContextValue>({
    user: null,
    realUser: null,
    effectiveUser: null,
    isImpersonating: false,
    impersonatedEmail: null,
    loading: true,
    refetch: () => { },
    startImpersonation: async () => false,
    stopImpersonation: async () => false,
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
    const [realUser, setRealUser] = useState<RealUser | null>(null);
    const [effectiveUser, setEffectiveUser] = useState<CurrentUser | null>(null);
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchMe = useCallback(() => {
        fetch('/api/me', { method: 'GET' })
            .then((res) => res.json())
            .then((data) => {
                if (data.authenticated) {
                    const nextRealUser: RealUser | null = data.realUser
                        ? {
                            name: data.realUser.name ?? null,
                            email: data.realUser.email ?? null,
                            role: data.realUser.role ?? null,
                            isCommitteeMember: Boolean(data.realUser.isCommitteeMember),
                            isAdmin: Boolean(data.realUser.isAdmin),
                            isSuperAdmin: Boolean(data.realUser.isSuperAdmin),
                            canEditCompanies: Boolean(data.realUser.canEditCompanies),
                        }
                        : null;
                    const nextEffectiveUser: CurrentUser | null = data.effectiveUser
                        ? {
                            name: data.effectiveUser.name ?? null,
                            email: data.effectiveUser.email ?? null,
                            role: data.effectiveUser.role ?? null,
                            isCommitteeMember: Boolean(data.effectiveUser.isCommitteeMember),
                            isAdmin: Boolean(data.effectiveUser.isAdmin),
                            canEditCompanies: Boolean(data.effectiveUser.canEditCompanies),
                        }
                        : null;
                    setRealUser(nextRealUser);
                    setEffectiveUser(nextEffectiveUser);
                    setIsImpersonating(Boolean(data.isImpersonating));
                    setImpersonatedEmail((data.impersonatedEmail as string | null) || null);
                } else {
                    setRealUser(null);
                    setEffectiveUser(null);
                    setIsImpersonating(false);
                    setImpersonatedEmail(null);
                }
            })
            .catch(() => {
                setRealUser(null);
                setEffectiveUser(null);
                setIsImpersonating(false);
                setImpersonatedEmail(null);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchMe();
    }, []);

    const startImpersonation = useCallback(async (email: string) => {
        try {
            const res = await fetch('/api/impersonation/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ impersonatedEmail: email }),
            });
            if (!res.ok) return false;
            setLoading(true);
            fetchMe();
            return true;
        } catch {
            return false;
        }
    }, [fetchMe]);

    const stopImpersonation = useCallback(async () => {
        try {
            const res = await fetch('/api/impersonation/stop', { method: 'POST' });
            if (!res.ok) return false;
            setLoading(true);
            fetchMe();
            return true;
        } catch {
            return false;
        }
    }, [fetchMe]);

    const user = useMemo(() => effectiveUser, [effectiveUser]);

    return (
        <CurrentUserContext.Provider value={{
            user,
            realUser,
            effectiveUser,
            isImpersonating,
            impersonatedEmail,
            loading,
            refetch: fetchMe,
            startImpersonation,
            stopImpersonation,
        }}>
            {children}
        </CurrentUserContext.Provider>
    );
}

export function useCurrentUser() {
    const ctx = useContext(CurrentUserContext);
    return ctx;
}
