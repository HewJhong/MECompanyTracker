import React, { useState } from 'react';
import {
    ArrowPathIcon,
    ChatBubbleLeftRightIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';

interface InteractionSectionProps {
    status: string;
    onLogOutreach: () => void;
    onLogCompanyReply: () => void;
    onLogOurReply: () => void;
    onResetFollowUps: () => void;
    isSaving: boolean;
    hasRemarks: boolean;
    followUpCount: number;
    selectedDate: string;
    onDateChange: (date: string) => void;
    lastContactDate?: string;
    lastCompanyResponseDate?: string;
    disabled?: boolean;
}

export default function InteractionSection({
    status,
    onLogOutreach,
    onLogCompanyReply,
    onLogOurReply,
    onResetFollowUps,
    isSaving,
    hasRemarks,
    followUpCount,
    selectedDate,
    onDateChange,
    lastContactDate,
    lastCompanyResponseDate,
    disabled: readOnly = false
}: InteractionSectionProps) {
    const [pendingAction, setPendingAction] = useState<'outreach' | 'companyReply' | 'ourReply' | null>(null);

    const isCompanyReplyVisible = status !== 'Rejected';
    const isOurReplyVisible = ['Negotiating', 'Interested', 'Completed'].includes(status);

    // Adaptive Follow-up Logic
    const now = new Date();
    const lastContact = lastContactDate ? new Date(lastContactDate) : null;
    const lastResponse = lastCompanyResponseDate ? new Date(lastCompanyResponseDate) : null;

    const isWaitingForCompanyReply = lastContact && (!lastResponse || lastContact > lastResponse);
    const daysSinceOurLastMessage = lastContact ? (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24) : 0;
    const showFollowUpTrigger = isOurReplyVisible && isWaitingForCompanyReply && daysSinceOurLastMessage >= 3;

    const getActionTitle = () => {
        if (pendingAction === 'outreach') return (status === 'Contacted' || status === 'No Reply' || showFollowUpTrigger) ? 'Log Follow Up' : 'Log Outreach';
        if (pendingAction === 'companyReply') return 'Log Company Reply';
        if (pendingAction === 'ourReply') return 'Log Our Reply';
        return '';
    };

    const handleActionClick = (action: 'outreach' | 'companyReply' | 'ourReply') => {
        // Set default date to now
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
        onDateChange(localISOTime);
        setPendingAction(action);
    };

    const handleConfirm = () => {
        if (pendingAction === 'outreach') onLogOutreach();
        else if (pendingAction === 'companyReply') onLogCompanyReply();
        else if (pendingAction === 'ourReply') onLogOurReply();
        setPendingAction(null);
    };

    return (
        <div className="space-y-4">
            {pendingAction ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">{getActionTitle()}</h4>
                            <button
                                onClick={() => setPendingAction(null)}
                                className="text-xs text-slate-500 hover:text-slate-700"
                            >
                                Cancel
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label htmlFor="actionDate" className="text-xs font-semibold text-slate-500 uppercase">Action Date</label>
                            <input
                                type="datetime-local"
                                id="actionDate"
                                value={selectedDate}
                                onChange={(e) => onDateChange(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                                <button
                                    onClick={handleConfirm}
                                    disabled={readOnly || isSaving || (pendingAction !== 'outreach' && !hasRemarks)}
                            className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all ${pendingAction === 'outreach' ? 'bg-teal-600 hover:bg-teal-700' :
                                pendingAction === 'companyReply' ? 'bg-purple-600 hover:bg-purple-700' :
                                    'bg-indigo-600 hover:bg-indigo-700'
                                } disabled:opacity-50`}
                        >
                            {isSaving ? 'Logging...' : `Confirm ${getActionTitle()}`}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {showFollowUpTrigger && (
                        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="mt-0.5 p-1 bg-amber-100 rounded-full">
                                <svg className="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-amber-900 leading-normal">
                                    The company hasn't responded to our last message in over 3 days. A follow-up is recommended.
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Slot 1: Our Action (Outreach or Reply) */}
                        <div>
                            {(!isOurReplyVisible || showFollowUpTrigger) ? (
                                <button
                                    onClick={() => handleActionClick('outreach')}
                                    disabled={readOnly || isSaving}
                                    className={`w-full h-full flex flex-col items-center justify-center p-4 border rounded-lg transition-colors gap-2 disabled:opacity-50 ${showFollowUpTrigger
                                        ? 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                        }`}
                                >
                                    <ArrowPathIcon className="w-6 h-6" />
                                    <span className="font-medium">{(status === 'Contacted' || status === 'No Reply' || showFollowUpTrigger) ? 'Log Follow Up' : 'Log Outreach'}</span>
                                    <span className="text-xs opacity-75">{showFollowUpTrigger ? 'Ghosting recovery' : (status === 'Contacted' || status === 'No Reply' ? 'Follow-up contact' : 'We contacted them')}</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleActionClick('ourReply')}
                                    disabled={readOnly || isSaving || !hasRemarks}
                                    className="w-full h-full flex flex-col items-center justify-center p-4 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-center"
                                    title={!hasRemarks ? "Please add a remark first" : ""}
                                >
                                    <ChatBubbleLeftRightIcon className="w-6 h-6" />
                                    <span className="font-medium">Log Our Reply</span>
                                    <span className="text-xs opacity-75">Response to company</span>
                                </button>
                            )}
                        </div>

                        {/* Slot 2: Their Action (Company Reply) */}
                        <div>
                            {isCompanyReplyVisible ? (
                                <button
                                    onClick={() => handleActionClick('companyReply')}
                                    disabled={readOnly || isSaving || !hasRemarks}
                                    className="w-full h-full flex flex-col items-center justify-center p-4 border border-purple-200 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-center"
                                    title={!hasRemarks ? "Please add a remark first" : ""}
                                >
                                    <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6" />
                                    <span className="font-medium">Log Company Reply</span>
                                    <span className="text-xs opacity-75">They replied to us</span>
                                </button>
                            ) : (
                                <div className="w-full h-full p-4 border border-slate-100 bg-slate-50 text-slate-400 rounded-lg flex flex-col items-center justify-center gap-2 opacity-50 text-center">
                                    <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6" />
                                    <span className="font-medium">No Reply Expected</span>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
