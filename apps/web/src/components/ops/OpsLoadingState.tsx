'use client';

import { Skeleton } from '@interdomestik/ui';

interface OpsLoadingStateProps {
  label?: string;
  className?: string;
  testId?: string;
}

export function OpsLoadingState({ label = 'Loading...', className, testId }: OpsLoadingStateProps) {
  return (
    <div
      className={['flex flex-col items-center justify-center py-12 px-4 space-y-4', className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
    >
      <div className="space-y-3 w-full max-w-[400px]">
        <Skeleton className="h-4 w-[250px] mx-auto" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[300px] mx-auto" />
      </div>
      {label && <p className="text-sm text-muted-foreground animate-pulse">{label}</p>}
    </div>
  );
}
