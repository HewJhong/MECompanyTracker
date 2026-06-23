export const REJECTION_REASON_TAG = '[Rejection Reason]';

export function extractPlainRejectionReason(remark?: string): string {
    if (!remark) return '';
    const trimmed = remark.trim();
    if (!trimmed) return '';

    // Keep only the "reason" part; strip appended audit/history blocks.
    const beforeAudit = trimmed.split('\n\n[Company Update]:')[0].trim();

    if (beforeAudit.startsWith(REJECTION_REASON_TAG)) {
        let rest = beforeAudit.slice(REJECTION_REASON_TAG.length).trim();
        if (rest.startsWith(':')) rest = rest.slice(1).trim();
        return rest;
    }

    if (beforeAudit.startsWith('[Company Update]:')) return '';

    // Back-compat: if older rows exist without a tag, treat the first block as reason.
    return beforeAudit.trim();
}

export function withRejectionReasonTag(reason: string): string {
    const trimmed = reason.trim();
    if (!trimmed) return '';
    return trimmed.startsWith(REJECTION_REASON_TAG) ? trimmed : `${REJECTION_REASON_TAG} ${trimmed}`;
}
