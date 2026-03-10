import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import ConfirmModal from './ConfirmModal';

interface Company {
    id: string;
    name: string;
    status: string;
    pic: string;
    remarks: string;
    // ... other fields if needed
    contacts?: {
        uniqueId: string;
        name: string;
        role: string;
        email: string;
    }[];
}

interface DuplicateMergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: {
        name: string;
        companies: Company[];
    };
    onMergeComplete: () => void;
}

export default function DuplicateMergeModal({ isOpen, onClose, group, onMergeComplete }: DuplicateMergeModalProps) {
    const [survivorId, setSurvivorId] = useState<string>('');
    const [mergeStrategy, setMergeStrategy] = useState({
        status: '',
        pic: '',
        remarks: ''
    });
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [merging, setMerging] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Initialize defaults when group changes
    useEffect(() => {
        if (group && group.companies.length >= 2) {
            const first = group.companies[0];
            const second = group.companies[1];

            // Default survivor: First one (usually smaller ID or first found)
            setSurvivorId(first.id);

            // Default strategy: Prefer non-empty values, prioritize survivor
            setMergeStrategy({
                status: first.status || second.status || 'To Contact',
                pic: first.pic || second.pic || '',
                remarks: first.remarks && second.remarks ? `${first.remarks} | ${second.remarks}` : (first.remarks || second.remarks || '')
            });

            // Default: Select ALL contacts from both
            const allContactIds = [...(first.contacts || []), ...(second.contacts || [])].map(c => c.uniqueId);
            setSelectedContacts(new Set(allContactIds));
        }
    }, [group]);

    if (!group || group.companies.length < 2) return null;

    const survivor = group.companies.find(c => c.id === survivorId) || group.companies[0];
    const victim = group.companies.find(c => c.id !== survivorId) || group.companies[1];

    const handleMerge = async () => {
        setMerging(true);
        try {
            const res = await fetch('/api/duplicates/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keepId: survivor.id,
                    mergeId: victim.id,
                    strategy: mergeStrategy,
                    keepContactIds: Array.from(selectedContacts)
                })
            });
            const data = await res.json();

            if (data.success) {
                onMergeComplete();
                onClose();
            } else {
                setErrorMessage('Merge failed: ' + data.message);
                setShowErrorModal(true);
            }
        } catch (error) {
            console.error('Merge error:', error);
            setErrorMessage('An error occurred during merge.');
            setShowErrorModal(true);
        } finally {
            setMerging(false);
        }
    };

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
                                <div className="absolute right-4 top-4">
                                    <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
                                        <XMarkIcon className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="p-6">
                                    <div className="mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 rounded-lg">
                                                <div className="w-6 h-6 text-purple-600 font-bold flex items-center justify-center">M</div>
                                            </div>
                                            <div>
                                                <Dialog.Title as="h3" className="text-xl font-semibold text-slate-900">
                                                    Resolve Duplicate: {group.name}
                                                </Dialog.Title>
                                                <p className="text-sm text-slate-500">
                                                    Select the primary company and choose which data to keep.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Selection of Survivor */}
                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        {group.companies.map(company => {
                                            const isSelected = survivorId === company.id;
                                            return (
                                                <div
                                                    key={company.id}
                                                    onClick={() => setSurvivorId(company.id)}
                                                    className={`cursor-pointer border-2 rounded-xl p-4 transition-all ${isSelected
                                                        ? 'border-purple-600 bg-purple-50 ring-1 ring-purple-600'
                                                        : 'border-slate-200 hover:border-purple-200 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-mono text-xs font-medium text-slate-500">{company.id}</span>
                                                        {isSelected && <CheckCircleIcon className="w-5 h-5 text-purple-600" />}
                                                    </div>
                                                    <div className="font-medium text-slate-900">{company.name}</div>
                                                    <div className="mt-2 text-xs text-slate-500">
                                                        {isSelected ? 'Primary Record (Survivor)' : 'Duplicate (Will be deleted)'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Merge Strategy */}
                                    <div className="space-y-6 border-t border-slate-200 pt-6">
                                        <h4 className="font-medium text-slate-900">Merge Strategy</h4>

                                        {/* Status Conflict */}
                                        <div className="grid grid-cols-12 gap-4 items-center">
                                            <div className="col-span-3 text-sm font-medium text-slate-700">Status</div>
                                            <div className="col-span-9 flex gap-4">
                                                {group.companies.map(c => (
                                                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="status"
                                                            checked={mergeStrategy.status === c.status}
                                                            onChange={() => setMergeStrategy(p => ({ ...p, status: c.status }))}
                                                            className="text-purple-600 focus:ring-purple-500"
                                                        />
                                                        <span className="text-sm text-slate-600">
                                                            {c.status} <span className="text-xs text-slate-400">({c.id})</span>
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* PIC Conflict */}
                                        <div className="grid grid-cols-12 gap-4 items-center">
                                            <div className="col-span-3 text-sm font-medium text-slate-700">Assigned PIC</div>
                                            <div className="col-span-9 flex gap-4">
                                                {group.companies.map(c => (
                                                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="pic"
                                                            checked={mergeStrategy.pic === c.pic}
                                                            onChange={() => setMergeStrategy(p => ({ ...p, pic: c.pic }))}
                                                            className="text-purple-600 focus:ring-purple-500"
                                                        />
                                                        <span className="text-sm text-slate-600">
                                                            {c.pic || 'Unassigned'} <span className="text-xs text-slate-400">({c.id})</span>
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Remarks */}
                                        <div className="grid grid-cols-12 gap-4 items-start">
                                            <div className="col-span-3 text-sm font-medium text-slate-700 pt-1">Remarks</div>
                                            <div className="col-span-9 space-y-2">
                                                <label className="flex items-start gap-2 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="remarks"
                                                        checked={mergeStrategy.remarks === (survivor.remarks && victim.remarks ? `${survivor.remarks} | ${victim.remarks}` : survivor.remarks)} // Simplified checking logic
                                                        onChange={() => setMergeStrategy(p => ({
                                                            ...p,
                                                            remarks: survivor.remarks && victim.remarks ? `${survivor.remarks} | ${victim.remarks}` : (survivor.remarks || victim.remarks)
                                                        }))}
                                                        className="mt-1 text-purple-600 focus:ring-purple-500"
                                                    />
                                                    <span className="text-sm text-slate-600">
                                                        Combine Both: <span className="font-mono text-xs bg-slate-100 px-1 rounded">
                                                            {survivor.remarks && victim.remarks ? `${survivor.remarks} | ${victim.remarks}` : (survivor.remarks || victim.remarks || 'No remarks')}
                                                        </span>
                                                    </span>
                                                </label>
                                                {group.companies.map(c => (
                                                    c.remarks && (
                                                        <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name="remarks"
                                                                checked={mergeStrategy.remarks === c.remarks}
                                                                onChange={() => setMergeStrategy(p => ({ ...p, remarks: c.remarks }))}
                                                                className="text-purple-600 focus:ring-purple-500"
                                                            />
                                                            <span className="text-sm text-slate-600">
                                                                Keep {c.id}: <span className="font-mono text-xs bg-slate-100 px-1 rounded">{c.remarks}</span>
                                                            </span>
                                                        </label>
                                                    )
                                                ))}
                                            </div>
                                        </div>

                                        {/* Contacts Selection */}
                                        <div className="space-y-4 pt-6 border-t border-slate-200">
                                            <h4 className="font-medium text-slate-900">Select Contacts to Keep</h4>
                                            <p className="text-sm text-slate-500">Unselected contacts will be permanently deleted.</p>

                                            <div className="grid grid-cols-2 gap-4">
                                                {group.companies.map(company => (
                                                    <div key={company.id} className="bg-slate-50 rounded-lg p-3">
                                                        <div className="flex justify-between mb-2">
                                                            <span className="text-xs font-semibold text-slate-700">{company.name} ({company.id})</span>
                                                            <span className="text-xs text-slate-500">{company.contacts?.length || 0} contacts</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {(company.contacts || []).length === 0 ? (
                                                                <div className="text-xs text-slate-400 italic">No contacts found</div>
                                                            ) : (
                                                                (company.contacts || []).map(contact => (
                                                                    <label key={contact.uniqueId} className="flex items-start gap-2 cursor-pointer hover:bg-slate-100 p-1 rounded -ml-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedContacts.has(contact.uniqueId)}
                                                                            onChange={(e) => {
                                                                                const newSet = new Set(selectedContacts);
                                                                                if (e.target.checked) newSet.add(contact.uniqueId);
                                                                                else newSet.delete(contact.uniqueId);
                                                                                setSelectedContacts(newSet);
                                                                            }}
                                                                            className="mt-1 text-purple-600 focus:ring-purple-500 rounded"
                                                                        />
                                                                        <div className="text-sm">
                                                                            <div className="font-medium text-slate-900">{contact.name || 'Unnamed'}</div>
                                                                            <div className="text-xs text-slate-500">{contact.role} {contact.email && `• ${contact.email}`}</div>
                                                                        </div>
                                                                    </label>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleMerge}
                                        disabled={merging}
                                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {merging ? (
                                            <>Processing...</>
                                        ) : (
                                            <>
                                                Merge & Delete {victim.id}
                                                <ArrowRightIcon className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>

            <ConfirmModal
                isOpen={showErrorModal}
                onClose={() => setShowErrorModal(false)}
                onConfirm={() => setShowErrorModal(false)}
                title="Merge Error"
                message={errorMessage}
                confirmText="OK"
                showCancel={false}
                variant="danger"
            />
        </Transition.Root>
    );
}
