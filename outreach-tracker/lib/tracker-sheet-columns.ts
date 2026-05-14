/**
 * Outreach Tracker (first tab) column letters for `values` batch updates.
 * Must stay aligned with [pages/api/data.ts](pages/api/data.ts) row indices and [pages/api/update.ts](pages/api/update.ts) TRACKER_MAP.
 */
export const TRACKER_COLUMN = {
    companyId: 'A',
    companyName: 'B',
    contactStatus: 'C',
    relationshipStatus: 'D',
    channel: 'E',
    urgencyScore: 'F',
    previousResponse: 'G',
    assignedPic: 'H',
    lastCompanyContact: 'I',
    lastContact: 'J',
    followUpsCompleted: 'K',
    sponsorshipTier: 'M',
    daysAttending: 'N',
    remarks: 'O',
    lastUpdate: 'P',
} as const;

/** 0-based index within a row slice starting at column A (row[0] = A). */
export const TRACKER_ROW_INDEX = {
    relationshipStatus: 3,
    sponsorshipTier: 12,
    daysAttending: 13,
} as const;

/** Keys match `/api/update` `updates` payload field names. */
export const TRACKER_FIELD_TO_COLUMN: Record<string, string> = {
    companyName: TRACKER_COLUMN.companyName,
    contactStatus: TRACKER_COLUMN.contactStatus,
    relationshipStatus: TRACKER_COLUMN.relationshipStatus,
    channel: TRACKER_COLUMN.channel,
    urgencyScore: TRACKER_COLUMN.urgencyScore,
    previousResponse: TRACKER_COLUMN.previousResponse,
    assignedPic: TRACKER_COLUMN.assignedPic,
    lastCompanyContact: TRACKER_COLUMN.lastCompanyContact,
    lastContact: TRACKER_COLUMN.lastContact,
    followUpsCompleted: TRACKER_COLUMN.followUpsCompleted,
    sponsorshipTier: TRACKER_COLUMN.sponsorshipTier,
    daysAttending: TRACKER_COLUMN.daysAttending,
    remarks: TRACKER_COLUMN.remarks,
    lastUpdate: TRACKER_COLUMN.lastUpdate,
};
