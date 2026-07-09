import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import PageContentLoader from '../components/PageContentLoader';

/** Code-split a heavy page body so the route shell (Layout + title) paints first. */
export function dynamicPageContent(
    importFn: () => Promise<{ default: ComponentType }>,
    label: string,
    LoadingFallback?: ComponentType,
) {
    return dynamic(importFn, {
        loading: LoadingFallback
            ? () => <LoadingFallback />
            : () => <PageContentLoader label={label} />,
        ssr: false,
    });
}
