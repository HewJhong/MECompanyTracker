function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function errHasStatus(err: unknown, status: number): boolean {
    if (!err || typeof err !== 'object') return false;
    const o = err as Record<string, unknown>;
    if (o.code === status || o.status === status) return true;
    const response = o.response as { status?: number } | undefined;
    if (response?.status === status) return true;
    const cause = o.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause === 'object') {
        if (cause.code === status || cause.status === status) return true;
        const cr = cause.response as { status?: number } | undefined;
        if (cr?.status === status) return true;
    }
    return false;
}

export function isRetryableSheetsError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    if (/quota|429|rate limit|RESOURCE_EXHAUSTED|UNAVAILABLE|ECONNRESET|ETIMEDOUT|Deadline exceeded/i.test(msg)) {
        return true;
    }
    return errHasStatus(err, 429) || errHasStatus(err, 503);
}

export type SheetsRetryOptions = {
    /** Base delay in ms; wait time before retry attempt `attempt` is `baseDelayMs * attempt` (linear). Default 800. */
    baseDelayMs?: number;
};

export async function withSheetsRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 4,
    label?: string,
    opts?: SheetsRetryOptions,
): Promise<T> {
    const baseDelayMs = opts?.baseDelayMs ?? 800;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt === maxAttempts || !isRetryableSheetsError(err)) {
                throw err;
            }
            const msg = err instanceof Error ? err.message : String(err);
            const nextDelayMs = baseDelayMs * attempt;
            console.warn('[sheets-retry] retryable error, will retry', {
                label: label ?? 'Sheets',
                attempt,
                maxAttempts,
                nextDelayMs,
                message: msg,
            });
            await sleep(nextDelayMs);
        }
    }
    throw lastErr;
}
