// `next/dynamic()` only fetches a page's Board chunk when that page actually
// renders — Next's automatic <Link> prefetching doesn't reach into dynamic
// imports nested inside a page. Without this, switching to a page you
// haven't visited yet always pays a network round-trip for its JS chunk
// before it can paint, even though the Layout shell is instant.
//
// Warming all Board chunks once, during idle time after the app's first
// paint, means that cost is paid up front instead of on every "first visit"
// to a tab — so quick tab switching feels instant even for pages you
// haven't opened yet this session.
let scheduled = false;

export function prefetchAppBoards(): void {
    if (scheduled || typeof window === 'undefined') return;
    scheduled = true;

    const importers: Array<() => Promise<unknown>> = [
        () => import('../components/DashboardBoard'),
        () => import('../components/CommitteeBoard'),
        () => import('../components/CompaniesBoard'),
        () => import('../components/CompanyDetailBoard'),
        () => import('../components/AnalyticsBoard'),
        () => import('../components/EmailScheduleBoard'),
        () => import('../components/SettingsBoard'),
    ];

    const run = () => {
        importers.forEach((load) => {
            load().catch(() => { /* best-effort prefetch */ });
        });
    };

    type WindowWithIdleCallback = Window & {
        requestIdleCallback?: (callback: () => void, opts?: { timeout: number }) => number;
    };
    const w = window as WindowWithIdleCallback;
    if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(run, { timeout: 3000 });
    } else {
        setTimeout(run, 1500);
    }
}
