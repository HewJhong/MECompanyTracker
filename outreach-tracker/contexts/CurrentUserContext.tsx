import React, { createContext, useContext, useEffect, useState } from 'react';

export interface CurrentUser {
    name: string;
    email: string;
    role: string;
}

interface CurrentUserContextValue {
    user: CurrentUser | null;
    loading: boolean;
    refetch: () => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue>({
    user: null,
    loading: true,
    refetch: () => {},
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchMe = () => {
        fetch('/api/me')
            .then((res) => res.json())
            .then((data) => {
                setUser({
                    name: data.name ?? 'Guest',
                    email: data.email ?? '',
                    role: data.role ?? 'Committee Member',
                });
            })
            .catch(() => {
                setUser({ name: 'Guest', email: '', role: 'Committee Member' });
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchMe();
    }, []);

    return (
        <CurrentUserContext.Provider value={{ user, loading, refetch: fetchMe }}>
            {children}
        </CurrentUserContext.Provider>
    );
}

export function useCurrentUser() {
    const ctx = useContext(CurrentUserContext);
    return ctx;
}
