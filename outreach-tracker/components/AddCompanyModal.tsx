import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { disciplineOptions } from '../lib/discipline-mapping';

interface AddCompanyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    committeeMembers: { name: string; email: string; role: string }[];
}

export default function AddCompanyModal({ isOpen, onClose, onSuccess, committeeMembers }: AddCompanyModalProps) {
    const [companyName, setCompanyName] = useState('');
    const [discipline, setDiscipline] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setCompanyName('');
            setDiscipline('');
            setContactName('');
            setContactEmail('');
            setContactPhone('');
            setAssignedTo('');
            setRemarks('');
            setError('');
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validation
        if (!companyName.trim()) {
            setError('Company name is required');
            return;
        }

        if (!discipline) {
            setError('Discipline is required');
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch('/api/add-company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName: companyName.trim(),
                    discipline,
                    contactName: contactName.trim() || undefined,
                    contactEmail: contactEmail.trim() || undefined,
                    contactPhone: contactPhone.trim() || undefined,
                    assignedTo: assignedTo || 'Unassigned',
                    remarks: remarks.trim() || undefined
                })
            });

            const data = await res.json();

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                setError(data.message || 'Failed to add company');
            }
        } catch (err) {
            console.error('Error adding company:', err);
            setError('An error occurred while adding the company');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4">
                {/* Backdrop */}
                <div
                    className="fixed inset-0 bg-black/50 transition-opacity"
                    onClick={onClose}
                />

                {/* Modal */}
                <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">Add New Company</h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                            >
                                <XMarkIcon className="w-6 h-6 text-white" />
                            </button>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Company Name */}
                        <div>
                            <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-2">
                                Company Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="companyName"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter company name"
                                required
                            />
                        </div>

                        {/* Discipline */}
                        <div>
                            <label htmlFor="discipline" className="block text-sm font-medium text-slate-700 mb-2">
                                Discipline <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="discipline"
                                value={discipline}
                                onChange={(e) => setDiscipline(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="">Select discipline...</option>
                                {disciplineOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>

                        {/* Contact Information */}
                        <div className="border-t border-slate-200 pt-6">
                            <h3 className="text-sm font-semibold text-slate-700 mb-4">Contact Information (Optional)</h3>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="contactName" className="block text-sm font-medium text-slate-700 mb-2">
                                        Contact Name
                                    </label>
                                    <input
                                        type="text"
                                        id="contactName"
                                        value={contactName}
                                        onChange={(e) => setContactName(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter contact name"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="contactEmail" className="block text-sm font-medium text-slate-700 mb-2">
                                        Contact Email
                                    </label>
                                    <input
                                        type="email"
                                        id="contactEmail"
                                        value={contactEmail}
                                        onChange={(e) => setContactEmail(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="contact@company.com"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="contactPhone" className="block text-sm font-medium text-slate-700 mb-2">
                                        Contact Phone
                                    </label>
                                    <input
                                        type="tel"
                                        id="contactPhone"
                                        value={contactPhone}
                                        onChange={(e) => setContactPhone(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="+1 234 567 8900"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Assigned To */}
                        <div>
                            <label htmlFor="assignedTo" className="block text-sm font-medium text-slate-700 mb-2">
                                Assign To
                            </label>
                            <select
                                id="assignedTo"
                                value={assignedTo}
                                onChange={(e) => setAssignedTo(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Unassigned</option>
                                {committeeMembers.map((member) => (
                                    <option key={member.email} value={member.name}>
                                        {member.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Remarks */}
                        <div>
                            <label htmlFor="remarks" className="block text-sm font-medium text-slate-700 mb-2">
                                Remarks
                            </label>
                            <textarea
                                id="remarks"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                placeholder="Add any additional notes..."
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Adding...' : 'Add Company'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
