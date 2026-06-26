import type { NextApiRequest, NextApiResponse } from 'next';
import { requireApiKey, getApiActorLabel } from '../../../../lib/api-key-auth';
import {
	getCompany,
	updateCompany,
	CompanyNotFoundError,
	RejectionReasonRequiredError,
	PartialWriteError,
} from '../../../../lib/companies';
import { isRetryableSheetsError } from '../../../../lib/sheets-retry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (!requireApiKey(req, res)) return;

	const { id } = req.query;
	if (typeof id !== 'string' || !/^ME-\d{4}$/.test(id)) {
		return res.status(400).json({ error: 'Invalid company ID format. Expected ME-XXXX', code: 'INVALID_ID' });
	}

	try {
		if (req.method === 'GET') {
			const company = await getCompany(id);
			if (!company) {
				return res.status(404).json({ error: `Company ${id} not found`, code: 'NOT_FOUND' });
			}
			return res.status(200).json({ company });
		}

		if (req.method === 'PUT') {
			const { updates, remark, actionDate } = req.body ?? {};

			if (!updates || typeof updates !== 'object') {
				return res.status(400).json({ error: 'Missing or invalid updates object', code: 'INVALID_UPDATES' });
			}

			const actorLabel = getApiActorLabel(req);
			const result = await updateCompany(
				id,
				updates as Record<string, unknown>,
				typeof remark === 'string' ? remark : '',
				actionDate,
				actorLabel,
			);
			return res.status(200).json({ success: true, verifiedData: result.verifiedData });
		}

		return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
	} catch (error) {
		if (error instanceof CompanyNotFoundError) {
			return res.status(404).json({ error: `Company ${id} not found`, code: 'NOT_FOUND' });
		}
		if (error instanceof RejectionReasonRequiredError) {
			return res.status(400).json({ error: 'Rejection reason is required when marking as Rejected', code: 'REJECTION_REASON_REQUIRED' });
		}
		if (error instanceof PartialWriteError) {
			return res.status(207).json({
				success: false,
				error: `Tracker updated but Database sync failed for company ${id}. Check Logs_DoNotEdit.`,
				code: 'PARTIAL_WRITE',
				partialSuccess: { tracker: true, database: false },
			});
		}
		if (isRetryableSheetsError(error)) {
			return res.status(503).json({ error: 'Sheets quota exceeded — retry in a moment', code: 'SHEETS_QUOTA' });
		}
		console.error(`[v1/companies/${id}]`, error);
		return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
	}
}
