import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function maintenanceEnabled(): boolean {
    const v = process.env.MAINTENANCE_MODE;
    return v === '1' || v?.toLowerCase() === 'true' || v?.toLowerCase() === 'on';
}

function isAssetPath(pathname: string): boolean {
    return (
        pathname.startsWith('/_next/') ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml'
    );
}

function isAuthApiPath(pathname: string): boolean {
    return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

export function middleware(req: NextRequest) {
    if (!maintenanceEnabled()) return NextResponse.next();

    const { pathname } = req.nextUrl;

    // Allow only NextAuth routes so users don't get stuck mid-login.
    if (isAuthApiPath(pathname)) return NextResponse.next();

    // Allow the maintenance page and static assets.
    if (pathname === '/maintenance' || isAssetPath(pathname)) return NextResponse.next();

    // Some GET handlers initialize or mutate Sheets, so maintenance mode must
    // block the entire API surface regardless of HTTP method. Dedicated
    // token-protected migration checks will be allowlisted when they exist.
    if (pathname.startsWith('/api/')) {
        return NextResponse.json(
            { error: 'Service temporarily disabled for maintenance.' },
            {
                status: 503,
                headers: {
                    'Cache-Control': 'no-store',
                    'Retry-After': '600',
                },
            },
        );
    }

    // For all other routes, rewrite to the maintenance page.
    const url = req.nextUrl.clone();
    url.pathname = '/maintenance';
    return NextResponse.rewrite(url, { headers: { 'Retry-After': '600' } });
}

export const config = {
    matcher: ['/((?!_next/static|_next/image).*)'],
};

