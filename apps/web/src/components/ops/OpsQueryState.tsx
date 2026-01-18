'use client';

import { Button } from '@interdomestik/ui';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { OpsEmptyState } from './OpsEmptyState';
import { OpsLoadingState } from './OpsLoadingState';

interface OpsQueryStateProps {
  loading?: boolean;
  error?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: ReactNode;
  children: ReactNode;
  loadingLabel?: string;
  loadingTestId?: string;
  emptyTestId?: string;
  errorTestId?: string;
  className?: string;
}

export function OpsQueryState({
  loading,
  error,
  isEmpty,
  onRetry,
  emptyTitle = 'No data found',
  emptySubtitle,
  emptyAction,
  children,
  loadingLabel,
  loadingTestId,
  emptyTestId,
  errorTestId,
  className,
}: OpsQueryStateProps) {
  if (loading) {
    return (
      <div className={className}>
        <OpsLoadingState label={loadingLabel} testId={loadingTestId} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={[
          'flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 text-muted-foreground',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={errorTestId}
      >
        <span>Failed to load data</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={className}>
        <OpsEmptyState
          title={emptyTitle}
          subtitle={emptySubtitle}
          action={emptyAction}
          testId={emptyTestId}
        />
      </div>
    );
  }

  return <>{children}</>;
}
