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

export function middleware(req: NextRequest) {
    if (!maintenanceEnabled()) return NextResponse.next();

    const { pathname } = req.nextUrl;

    // Allow auth routes so users don't get stuck mid-login.
    if (pathname.startsWith('/api/auth')) return NextResponse.next();

    // Allow the maintenance page and static assets.
    if (pathname === '/maintenance' || isAssetPath(pathname)) return NextResponse.next();

    // Block any potentially mutating API calls to prevent data loss.
    if (pathname.startsWith('/api/')) {
        const method = req.method.toUpperCase();
        const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        if (!isRead) {
            return NextResponse.json(
                { error: 'Service temporarily disabled for maintenance.' },
                { status: 503, headers: { 'Retry-After': '600' } },
            );
        }
        // Even read APIs should remain available (e.g., for debugging).
        return NextResponse.next();
    }

    // For all other routes, rewrite to the maintenance page.
    const url = req.nextUrl.clone();
    url.pathname = '/maintenance';
    return NextResponse.rewrite(url, { headers: { 'Retry-After': '600' } });
}

export const config = {
    matcher: ['/((?!_next/static|_next/image).*)'],
};

