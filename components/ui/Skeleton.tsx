'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-[#F5F5F7] rounded-md ${className}`} />;
}

export function SkeletonCircle({ size = 56 }: { size?: number }) {
  return (
    <div
      className="animate-pulse bg-[#F5F5F7] rounded-full"
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-6">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonMetricGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
      <div className="p-4 border-b border-[#E5E5E5]">
        <Skeleton className="h-4 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 border-b border-[#E5E5E5] last:border-0 flex gap-4">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton version of a card that contains a title + list of bars. */
export function SkeletonBarCard({ bars = 4 }: { bars?: number }) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-6">
      <Skeleton className="h-4 w-40 mb-5" />
      <div className="space-y-4">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i}>
            <div className="flex justify-between mb-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-page skeleton for the Analysis page. */
export function SkeletonAnalysisPage() {
  return (
    <div className="space-y-6 animate-in">
      {/* Header: title + profile badge + 4 meta score circles */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Skeleton className="h-6 w-32 mb-3" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="text-center">
              <SkeletonCircle size={56} />
              <Skeleton className="h-3 w-12 mx-auto mt-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border border-[#E5E5E5] rounded-lg p-1 overflow-x-auto">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-7 w-20" />)}
      </div>

      {/* Overview tab: metric grid + two side cards */}
      <SkeletonMetricGrid count={4} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonTable rows={5} cols={3} />
        <div className="border border-[#E5E5E5] rounded-xl p-6 space-y-3">
          <Skeleton className="h-4 w-32 mb-2" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between py-2 border-b border-[#E5E5E5] last:border-0">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Full-page skeleton for the Forecast page. */
export function SkeletonForecastPage() {
  return (
    <div className="space-y-6">
      {/* Header: title + timeframe tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-1 border border-[#E5E5E5] rounded-lg p-1">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-12" />)}
        </div>
      </div>

      {/* Context chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-28" />)}
      </div>

      {/* Decay chart card */}
      <div className="border border-[#E5E5E5] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-[150px] w-full" />
      </div>

      {/* Scenario cards */}
      <Skeleton className="h-3 w-32" />
      <SkeletonBarCard bars={4} />
      <SkeletonBarCard bars={4} />

      {/* AI summary */}
      <div className="border border-[#E5E5E5] rounded-xl p-6">
        <Skeleton className="h-4 w-28 mb-4" />
        <div className="flex items-start justify-between mb-4">
          <div>
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div>
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-11/12 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-3 w-full mb-1" />
            <Skeleton className="h-3 w-5/6 mb-1" />
          </div>
          <div>
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-3 w-full mb-1" />
            <Skeleton className="h-3 w-3/4 mb-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-page skeleton for the Dashboard (overview) page with wallet loaded. */
export function SkeletonDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Wallet header */}
      <div>
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Three navigation cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border border-[#E5E5E5] rounded-xl p-5">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>

      {/* Last updated card with refresh button */}
      <div className="border border-[#E5E5E5] rounded-xl p-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
