import type { NextApiRequest, NextApiResponse } from 'next';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';
import { updateCompany, CompanyNotFoundError, RejectionReasonRequiredError, PartialWriteError } from '../../lib/companies';
import { isRetryableSheetsError } from '../../lib/sheets-retry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const { companyId, updates: updatesBody, user, remark, actionDate } = req.body;

    if (!companyId || !user) {
        return res.status(400).json({ message: 'Missing required fields (companyId, user)' });
    }
    if (!updatesBody || typeof updatesBody !== 'object') {
        return res.status(400).json({ message: 'Missing or invalid updates' });
    }

    try {
        const actorLabel = formatActorLabel(ctx);
        const result = await updateCompany(
            companyId,
            updatesBody as Record<string, unknown>,
            typeof remark === 'string' ? remark : '',
            actionDate,
            actorLabel,
        );

        console.log('[api/update] verify_ok', {
            companyId,
            actor: actorLabel,
            historyLogged: result.historyLogged,
            contactStatus: result.verifiedData.contactStatus,
            followUpsCompleted: result.verifiedData.followUpsCompleted,
            lastUpdated: result.verifiedData.lastUpdated,
        });

        return res.status(200).json({
            success: true,
            updatedRows: result.updatedRows,
            verifiedData: result.verifiedData,
            historyLogged: result.historyLogged,
        });
    } catch (error) {
        if (error instanceof CompanyNotFoundError) {
            return res.status(404).json({ message: 'Company not found in Outreach Tracker' });
        }
        if (error instanceof RejectionReasonRequiredError) {
            return res.status(400).json({ message: 'Rejection reason is required when marking as Rejected.' });
        }
        if (error instanceof PartialWriteError) {
            return res.status(207).json({
                success: false,
                message: `Tracker was updated but Database sync failed. Data may be out of sync. Company: ${error.companyId}. Check Logs_DoNotEdit for details.`,
                partialSuccess: { tracker: true, database: false },
            });
        }
        if (isRetryableSheetsError(error)) {
            return res.status(503).json({ message: 'Sheets quota exceeded — please retry in a moment', quota: true });
        }
        console.error('Update Error:', error);
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Update Failed' });
    }
}
