interface PageContentLoaderProps {
    label?: string;
    /** Full viewport centering (e.g. auth bootstrap on `/`). */
    fullScreen?: boolean;
}

export default function PageContentLoader({
    label = 'Loading…',
    fullScreen = false,
}: PageContentLoaderProps) {
    const inner = (
        <>
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
            <p className="text-sm font-medium text-slate-600">{label}</p>
        </>
    );

    if (fullScreen) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
                {inner}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[28rem] gap-3">
            {inner}
        </div>
    );
}
