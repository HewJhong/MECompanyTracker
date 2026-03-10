
import React from 'react';
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
