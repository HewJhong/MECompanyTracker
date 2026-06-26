import type { NextApiRequest, NextApiResponse } from 'next';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';
import { createCompany } from '../../lib/companies';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    try {
        const { companyName, discipline, contactName, contactRole, contactEmail, contactPhone, assignedTo, remarks, batchLabel } = req.body;

        if (!companyName || !companyName.trim()) {
            return res.status(400).json({ message: 'Company name is required' });
        }
        if (!discipline) {
            return res.status(400).json({ message: 'Discipline is required' });
        }

        const actorLabel = formatActorLabel(ctx);
        const { companyId } = await createCompany(
            { companyName, discipline, contactName, contactRole, contactEmail, contactPhone, assignedTo, remarks, batchLabel },
            actorLabel,
        );

        return res.status(200).json({ message: 'Company added successfully', companyId });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
