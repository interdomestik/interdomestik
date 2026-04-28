import { SkeletonTable } from '@/components/ui/skeleton-loader';

export default function StaffClaimsLoading() {
  return (
    <div className="space-y-6" data-testid="staff-claims-loading">
      <div>
        <div className="mb-2 h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-10 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <SkeletonTable rows={8} />
    </div>
  );
}
