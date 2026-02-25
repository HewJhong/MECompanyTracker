import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

interface AdminRouteProps {
    children: React.ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
    const { user, loading } = useCurrentUser();
    const router = useRouter();

    useEffect(() => {
        if (!loading && (!user || !user.isAdmin)) {
            // Non-admin users are redirected to home page
            router.push('/');
        }
    }, [loading, user, router]);

    // Show loading state while checking permissions
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-slate-600">Verifying permissions...</p>
                </div>
            </div>
        );
    }

    // Don't render anything if user is not admin (will redirect via useEffect)
    if (!user?.isAdmin) {
        return null;
    }

    // User is admin, render children
    return <>{children}</>;
}
