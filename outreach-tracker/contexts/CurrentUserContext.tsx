import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const VIEW_AS_MEMBER_KEY = 'outreach_view_as_member';

export interface CurrentUser {
    name: string | null;
    email: string | null;
    role: string | null;
    isCommitteeMember: boolean;
    isAdmin: boolean;
}

interface CurrentUserContextValue {
    user: CurrentUser | null;
    loading: boolean;
    refetch: () => void;
    viewAsMember: boolean;
    setViewAsMember: (value: boolean) => void;
    effectiveIsAdmin: boolean;
}

const CurrentUserContext = createContext<CurrentUserContextValue>({
    user: null,
    loading: true,
    refetch: () => { },
    viewAsMember: false,
    setViewAsMember: () => { },
    effectiveIsAdmin: false,
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewAsMember, setViewAsMemberState] = useState(false);

    const fetchMe = () => {
        fetch('/api/me')
            .then((res) => res.json())
            .then((data) => {
                if (data.authenticated) {
                    setUser({
                        name: data.name,
                        email: data.email,
                        role: data.role,
                        isCommitteeMember: data.isCommitteeMember || false,
                        isAdmin: data.isAdmin || false,
                    });
                } else {
                    setUser(null);
                }
            })
            .catch(() => {
                setUser(null);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchMe();
    }, []);

    useEffect(() => {
        if (user && !user.isAdmin) {
            setViewAsMemberState(false);
            try {
                if (typeof window !== 'undefined') localStorage.removeItem(VIEW_AS_MEMBER_KEY);
            } catch { }
        } else if (user?.isAdmin && typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(VIEW_AS_MEMBER_KEY);
                setViewAsMemberState(stored === '1');
            } catch { }
        }
    }, [user?.isAdmin, user]);

    const setViewAsMember = useCallback((value: boolean) => {
        if (typeof window !== 'undefined') {
            try {
                if (value) localStorage.setItem(VIEW_AS_MEMBER_KEY, '1');
                else localStorage.removeItem(VIEW_AS_MEMBER_KEY);
            } catch { }
        }
        setViewAsMemberState(value);
    }, []);

    const effectiveIsAdmin = user?.isAdmin === true && !viewAsMember;

    return (
        <CurrentUserContext.Provider value={{ user, loading, refetch: fetchMe, viewAsMember, setViewAsMember, effectiveIsAdmin }}>
            {children}
        </CurrentUserContext.Provider>
    );
}

export function useCurrentUser() {
    const ctx = useContext(CurrentUserContext);
    return ctx;
}
