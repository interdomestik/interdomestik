export function MemberDashboardSkeleton() {
  return (
    <div className="space-y-10 pb-10 animate-pulse">
      {/* Header Skeleton */}
      <div className="relative overflow-hidden rounded-[2rem] bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 p-8 sm:p-10 shadow-sm">
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded-full" />
            <div className="h-12 w-64 bg-slate-300 dark:bg-slate-700 rounded-xl" />
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>

          <div className="h-[160px] w-[280px] rounded-[1.5rem] bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>

      {/* Ribbon Skeleton */}
      <div className="h-24 w-full rounded-3xl bg-slate-100 dark:bg-slate-900" />

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-44 rounded-[2rem] bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>

      {/* Ecosystem Skeleton */}
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 rounded-3xl bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
      </div>
    </div>
  );
}
