import { Bone, SkeletonCard } from './Skeleton';

/**
 * Skeleton for Dashboard (Command Center) content area.
 * Mirrors DashboardBoard layout: metric cards, breakdown, chart + list.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading command center">
      {/* Row 1: metrics - 2 normal + 1 double-wide */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SkeletonCard>
          <Bone className="h-4 w-24 mb-3" />
          <Bone className="h-8 w-16 mb-2" />
          <Bone className="h-3 w-32" />
        </SkeletonCard>
        <SkeletonCard>
          <Bone className="h-4 w-24 mb-3" />
          <Bone className="h-8 w-16 mb-2" />
          <Bone className="h-3 w-32" />
        </SkeletonCard>
        <SkeletonCard className="lg:col-span-2">
          <Bone className="h-4 w-32 mb-4" />
          <div className="space-y-2">
            <Bone className="h-6 w-full" />
            <Bone className="h-6 w-full" />
            <Bone className="h-6 w-3/4" />
          </div>
        </SkeletonCard>
      </div>

      {/* Row 2: full-width breakdown card with 4 inner blocks */}
      <SkeletonCard>
        <Bone className="h-5 w-40 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-4 w-28" />
              <Bone className="h-6 w-12" />
              <Bone className="h-3 w-20" />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Row 3: chart (2 cols) + side list (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <SkeletonCard className="lg:col-span-2">
          <Bone className="h-5 w-32 mb-6" />
          <Bone className="h-64 w-full" />
        </SkeletonCard>
        <SkeletonCard>
          <Bone className="h-5 w-28 mb-6" />
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-4 w-full" />
                <Bone className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}

/**
 * Skeleton for Analytics page content area.
 * Mirrors AnalyticsBoard layout: metrics, distributions, chart, tables.
 */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading analytics">
      {/* Row 1: three metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-4 w-24 mb-3" />
            <Bone className="h-8 w-16 mb-2" />
            <Bone className="h-3 w-28" />
          </SkeletonCard>
        ))}
      </div>

      {/* Row 2: three distribution cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-5 w-32 mb-6" />
            <div className="space-y-3">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Bone className="h-4 w-4 rounded-full" />
                  <Bone className="h-4 flex-1" />
                  <Bone className="h-4 w-10" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>

      {/* Row 3: wide chart card */}
      <SkeletonCard>
        <Bone className="h-5 w-40 mb-6" />
        <Bone className="h-64 w-full" />
      </SkeletonCard>

      {/* Row 4: three table/list cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {[...Array(3)].map((_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-5 w-32 mb-6" />
            <div className="space-y-3">
              {[...Array(7)].map((_, j) => (
                <div key={j} className="space-y-2">
                  <Bone className="h-4 w-full" />
                  <Bone className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for Email Schedule page content area.
 * Mirrors EmailScheduleBoard: assignment balance chart, week nav, legend, 7 day columns.
 */
export function EmailScheduleSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading schedule">
      {/* Assignment balance by committee member */}
      <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <Bone className="h-4 w-64" />
          <div className="flex items-center gap-4">
            <Bone className="h-3 w-36" />
            <Bone className="h-3 w-32" />
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-100 flex items-center gap-3 px-3 py-2"
            >
              <Bone className="h-4 w-28 shrink-0" />
              <Bone className="h-6 flex-1 rounded-full" />
              <Bone className="h-4 w-14 shrink-0" />
              <Bone className="h-4 w-4 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Week navigation: prev / Today / next + date range */}
      <div className="flex items-center gap-4 mb-4">
        <Bone className="h-9 w-9 rounded-lg" />
        <Bone className="h-8 w-16 rounded-lg" />
        <Bone className="h-9 w-9 rounded-lg" />
        <Bone className="h-4 w-44" />
      </div>

      {/* Legend + view toggle */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <Bone className="h-3 w-40" />
        <Bone className="h-9 w-20 rounded-lg" />
      </div>

      {/* 7 day columns — header + thin time-slot rows */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(7)].map((_, dayIdx) => (
          <div
            key={dayIdx}
            className="flex-shrink-0 w-[320px] min-w-[320px] max-w-[320px] rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col"
          >
            <div className="px-4 py-3 rounded-t-xl border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="space-y-1.5">
                <Bone className="h-4 w-24" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex-1 p-2 space-y-1 overflow-hidden max-h-[520px]">
              {[...Array(10)].map((_, slotIdx) => (
                <div
                  key={slotIdx}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 flex items-center gap-2"
                >
                  <Bone className="h-3 w-14 shrink-0" />
                  <Bone className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
