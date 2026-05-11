
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type TaskStatus = 'pending' | 'success' | 'error' | 'warning';

/** Shown as “current / total” next to the progress bar (e.g. companies updated). */
export interface TaskProgressCounts {
    current: number;
    total: number;
}

export interface Task {
    id: string;
    message: string;
    status: TaskStatus;
    error?: string;
    isDismissing?: boolean;
    /** 0–100 while pending; omit for an indeterminate (busy) progress bar */
    progress?: number;
    /** When set with total > 0, UI shows current/total (e.g. companies). */
    progressCurrent?: number;
    progressTotal?: number;
    /**
     * When set on an error task, a Retry button is shown. Clicking it dismisses this task
     * and fires the callback (which typically starts a new task for just the failed items).
     */
    onRetry?: () => void;
    /**
     * When set alongside onRetry, the indicator shows a live countdown and auto-fires
     * onRetry when it reaches 0. Value is seconds from the moment makeTaskRetryable is called.
     */
    retryAfterSec?: number;
}

interface BackgroundTasksContextType {
    tasks: Task[];
    addTask: (message: string) => string;
    updateTaskProgress: (id: string, progress: number, counts?: TaskProgressCounts) => void;
    completeTask: (id: string, message?: string) => void;
    failTask: (id: string, error?: string) => void;
    /**
     * Transition an existing (pending or error) task to an error state with a Retry button.
     * The task will NOT auto-dismiss so the user can see and act on it.
     * @param retryFn Called when user clicks Retry (or auto-retry fires). The task is dismissed
     *                before retryFn runs; retryFn should open a new task for the retry work.
     * @param retryAfterSec If provided, the indicator counts down and auto-fires retryFn.
     */
    makeTaskRetryable: (id: string, error: string, retryFn: () => void, retryAfterSec?: number) => void;
    dismissTask: (id: string) => void;
    removeTask: (id: string) => void;
    setWarningTask: (id: string, message: string, active: boolean) => void;
}

const BackgroundTasksContext = createContext<BackgroundTasksContextType | undefined>(undefined);

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
    const [tasks, setTasks] = useState<Task[]>([]);

    const addTask = useCallback((message: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setTasks(prev => [...prev, { id, message, status: 'pending' }]);
        return id;
    }, []);

    const updateTaskProgress = useCallback((id: string, progress: number, counts?: TaskProgressCounts) => {
        const clamped = Math.min(100, Math.max(0, Math.round(progress)));
        setTasks(prev =>
            prev.map(task => {
                if (task.id !== id || task.status !== 'pending') return task;
                const next: Task = { ...task, progress: clamped };
                if (counts !== undefined) {
                    const total = Math.max(0, Math.floor(counts.total));
                    const current = total === 0 ? 0 : Math.min(Math.max(0, Math.floor(counts.current)), total);
                    next.progressCurrent = current;
                    next.progressTotal = total;
                }
                return next;
            }),
        );
    }, []);

    const removeTask = useCallback((id: string) => {
        setTasks(prev => prev.filter(task => task.id !== id));
    }, []);

    const dismissTask = useCallback((id: string) => {
        setTasks(prev => prev.map(task =>
            task.id === id ? { ...task, isDismissing: true } : task
        ));
        // Actually remove after animation completes
        setTimeout(() => removeTask(id), 500); // 500ms matches exit transition duration
    }, [removeTask]);

    const completeTask = useCallback((id: string, message?: string) => {
        setTasks(prev => prev.map(task =>
            task.id === id
                ? {
                    ...task,
                    status: 'success',
                    message: message || task.message,
                    progress: undefined,
                    progressCurrent: undefined,
                    progressTotal: undefined,
                }
                : task
        ));
        // Auto-remove success tasks after a delay
        setTimeout(() => dismissTask(id), 3000);
    }, [dismissTask]);

    const failTask = useCallback((id: string, error?: string) => {
        setTasks(prev => prev.map(task =>
            task.id === id
                ? {
                    ...task,
                    status: 'error',
                    error: error || 'Task failed',
                    progress: undefined,
                    progressCurrent: undefined,
                    progressTotal: undefined,
                    onRetry: undefined,
                    retryAfterSec: undefined,
                }
                : task
        ));
        // Auto-remove error tasks after a longer delay (optional, or keep them until dismissed)
        setTimeout(() => dismissTask(id), 5000);
    }, [dismissTask]);

    const makeTaskRetryable = useCallback((id: string, error: string, retryFn: () => void, retryAfterSec?: number) => {
        // The onRetry stored in the task dismisses itself then calls the external retry function.
        // We must build this inside setTasks to capture the latest dismissTask ref-safe via closure.
        const onRetry = () => {
            dismissTask(id);
            retryFn();
        };
        setTasks(prev => prev.map(task =>
            task.id === id
                ? {
                    ...task,
                    status: 'error' as TaskStatus,
                    error,
                    progress: undefined,
                    progressCurrent: undefined,
                    progressTotal: undefined,
                    isDismissing: false,
                    onRetry,
                    retryAfterSec,
                }
                : task
        ));
        // No auto-dismiss — the user must click Retry or Dismiss
    }, [dismissTask]);

    const setWarningTask = useCallback((id: string, message: string, active: boolean) => {
        setTasks(prev => {
            const exists = prev.find(t => t.id === id);
            if (active) {
                if (exists) {
                    return prev.map(t => t.id === id ? { ...t, message, status: 'warning', isDismissing: false } : t);
                }
                return [...prev, { id, message, status: 'warning' }];
            } else {
                return prev.filter(t => t.id !== id);
            }
        });
    }, []);

    return (
        <BackgroundTasksContext.Provider value={{ tasks, addTask, updateTaskProgress, completeTask, failTask, makeTaskRetryable, dismissTask, removeTask, setWarningTask }}>
            {children}
        </BackgroundTasksContext.Provider>
    );
}

export function useBackgroundTasks() {
    const context = useContext(BackgroundTasksContext);
    if (context === undefined) {
        throw new Error('useBackgroundTasks must be used within a BackgroundTasksProvider');
    }
    return context;
}
