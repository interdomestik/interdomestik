import { SkeletonTable } from '@/components/ui/skeleton-loader';

export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2" />
        <div className="h-4 w-96 bg-muted animate-pulse rounded" />
      </div>
      <SkeletonTable rows={10} />
    </div>
  );
}
