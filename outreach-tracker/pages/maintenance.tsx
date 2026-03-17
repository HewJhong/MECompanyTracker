export default function MaintenancePage() {
    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                padding: 24,
                fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
                background: 'linear-gradient(180deg, #0b1220 0%, #0a0f1a 100%)',
                color: '#e5e7eb',
            }}
        >
            <section
                style={{
                    width: '100%',
                    maxWidth: 680,
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 16,
                    padding: 24,
                    background: 'rgba(255,255,255,0.04)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                }}
            >
                <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.3 }}>
                    Outreach Tracker is temporarily paused
                </h1>
                <p style={{ marginTop: 10, marginBottom: 0, lineHeight: 1.55, color: '#cbd5e1' }}>
                    We’re doing a quick maintenance window to prevent any data from being changed while a fix is in
                    progress.
                </p>
                <div
                    style={{
                        marginTop: 16,
                        padding: 14,
                        borderRadius: 12,
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: '1px solid rgba(148, 163, 184, 0.18)',
                        color: '#e2e8f0',
                        fontSize: 14,
                        lineHeight: 1.5,
                    }}
                >
                    If you need urgent access, contact an admin. Otherwise, please try again in a bit.
                </div>
            </section>
        </main>
    );
}

