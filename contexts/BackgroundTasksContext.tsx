
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type TaskStatus = 'pending' | 'success' | 'error' | 'warning';

export interface Task {
    id: string;
    message: string;
    status: TaskStatus;
    error?: string;
    isDismissing?: boolean;
}

interface BackgroundTasksContextType {
    tasks: Task[];
    addTask: (message: string) => string;
    completeTask: (id: string, message?: string) => void;
    failTask: (id: string, error?: string) => void;
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
                ? { ...task, status: 'success', message: message || task.message }
                : task
        ));
        // Auto-remove success tasks after a delay
        setTimeout(() => dismissTask(id), 3000);
    }, [dismissTask]);

    const failTask = useCallback((id: string, error?: string) => {
        setTasks(prev => prev.map(task =>
            task.id === id
                ? { ...task, status: 'error', error: error || 'Task failed' }
                : task
        ));
        // Auto-remove error tasks after a longer delay (optional, or keep them until dismissed)
        setTimeout(() => dismissTask(id), 5000);
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
        <BackgroundTasksContext.Provider value={{ tasks, addTask, completeTask, failTask, dismissTask, removeTask, setWarningTask }}>
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
