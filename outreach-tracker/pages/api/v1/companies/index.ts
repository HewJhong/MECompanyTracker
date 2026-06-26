import type { NextApiRequest, NextApiResponse } from 'next';
import { requireApiKey, getApiActorLabel } from '../../../../lib/api-key-auth';
import { createCompany, listCompanies } from '../../../../lib/companies';
import { isRetryableSheetsError } from '../../../../lib/sheets-retry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (!requireApiKey(req, res)) return;

	try {
		if (req.method === 'GET') {
			const includeArchived = req.query.includeArchived === 'true';
			const companies = await listCompanies({ includeArchived });
			return res.status(200).json({ companies });
		}

		if (req.method === 'POST') {
			const {
				companyName,
				discipline,
				contactName,
				contactRole,
				contactEmail,
				contactPhone,
				assignedTo,
				remarks,
				batchLabel,
			} = req.body ?? {};

			if (!companyName?.trim()) {
				return res.status(400).json({ error: 'Company name is required', code: 'MISSING_COMPANY_NAME' });
			}
			if (!discipline) {
				return res.status(400).json({ error: 'Discipline is required', code: 'MISSING_DISCIPLINE' });
			}

			const actorLabel = getApiActorLabel(req);
			const { companyId } = await createCompany(
				{ companyName, discipline, contactName, contactRole, contactEmail, contactPhone, assignedTo, remarks, batchLabel },
				actorLabel,
			);
			return res.status(201).json({ companyId });
		}

		return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
	} catch (error) {
		if (isRetryableSheetsError(error)) {
			console.error('[v1/companies] Sheets quota exhausted:', error);
			return res.status(503).json({ error: 'Sheets quota exceeded — retry in a moment', code: 'SHEETS_QUOTA' });
		}
		console.error('[v1/companies]', error);
		return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
	}
}
