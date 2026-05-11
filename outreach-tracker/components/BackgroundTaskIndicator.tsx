
import React, { useState, useEffect, useRef } from 'react';
import { useBackgroundTasks, Task, TaskStatus } from '../contexts/BackgroundTasksContext';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const StatusIcon = ({ status }: { status: TaskStatus }) => {
    switch (status) {
        case 'pending':
            return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />;
        case 'success':
            return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
        case 'error':
            return <XCircleIcon className="w-5 h-5 text-red-500" />;
        case 'warning':
            return <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />;
    }
};

const TaskCard = ({ task, onDismiss }: { task: Task, onDismiss: (id: string) => void }) => {
    const showProgressCounts =
        task.status === 'pending'
        && typeof task.progressCurrent === 'number'
        && typeof task.progressTotal === 'number'
        && task.progressTotal > 0;
    const countLabel = showProgressCounts ? `${task.progressCurrent}/${task.progressTotal}` : null;
    const progressAriaText = showProgressCounts
        ? `${task.progressCurrent} of ${task.progressTotal}`
        : typeof task.progress === 'number'
            ? `${task.progress}%`
            : undefined;

    // Countdown state for retryable tasks
    const isRetryable = task.status === 'error' && typeof task.onRetry === 'function';
    const [countdown, setCountdown] = useState<number | null>(
        isRetryable && typeof task.retryAfterSec === 'number' ? task.retryAfterSec : null,
    );
    // Stable ref so the effect always calls the latest onRetry without re-triggering
    const onRetryRef = useRef(task.onRetry);
    useEffect(() => { onRetryRef.current = task.onRetry; }, [task.onRetry]);

    useEffect(() => {
        if (!isRetryable || countdown === null) return;
        if (countdown <= 0) {
            onRetryRef.current?.();
            return;
        }
        const t = setTimeout(() => setCountdown(c => (c !== null && c > 0 ? c - 1 : c)), 1000);
        return () => clearTimeout(t);
    }, [isRetryable, countdown]);

    return (
        <div className="w-full max-w-sm overflow-hidden bg-white rounded-lg shadow-lg pointer-events-auto border border-slate-200">
            <Transition
                show={!task.isDismissing}
                appear={true}
                enter="transform ease-out duration-300 transition"
                enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
                enterTo="translate-y-0 opacity-100 sm:translate-x-0"
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
            >
                <div className="p-4">
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            <StatusIcon status={task.status} />
                        </div>
                        <div className="ml-3 w-0 flex-1 pt-0.5">
                            <p className="text-sm font-medium text-gray-900">{task.message}</p>
                            {task.error && (
                                <p className="mt-1 text-xs text-red-500">{task.error}</p>
                            )}
                            {task.status === 'pending' && (
                                <div className="mt-3">
                                    {countLabel && (
                                        <p className="mb-1.5 text-xs font-medium tabular-nums text-slate-600">
                                            {countLabel}
                                        </p>
                                    )}
                                    <div
                                        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={typeof task.progress === 'number' ? task.progress : undefined}
                                        aria-valuetext={progressAriaText}
                                        aria-label="Task progress"
                                    >
                                        {typeof task.progress === 'number' ? (
                                            <div
                                                className="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out"
                                                style={{ width: `${task.progress}%` }}
                                            />
                                        ) : (
                                            <div className="relative h-full w-full overflow-hidden rounded-full">
                                                <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-blue-500 task-progress-indeterminate" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {isRetryable && (
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            setCountdown(null);
                                            task.onRetry?.();
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 transition-colors"
                                    >
                                        <ArrowPathIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                        Retry
                                    </button>
                                    {countdown !== null && countdown > 0 && (
                                        <span className="text-xs tabular-nums text-slate-400">
                                            auto in {countdown}s
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="ml-4 flex-shrink-0 flex">
                            <button
                                onClick={() => onDismiss(task.id)}
                                className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                <span className="sr-only">Close</span>
                                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </div>
    );
};

export default function BackgroundTaskIndicator() {
    const { tasks, dismissTask } = useBackgroundTasks();

    if (tasks.length === 0) return null;

    return (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 pointer-events-none sm:p-6 w-full max-w-sm">
            {tasks.map(task => (
                <TaskCard key={task.id} task={task} onDismiss={dismissTask} />
            ))}
        </div>
    );
}
