import { ReactNode } from 'react';

/**
 * Pulsing placeholder bone for skeleton layouts.
 */
export function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}

/**
 * Card shell for skeleton content areas.
 */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
