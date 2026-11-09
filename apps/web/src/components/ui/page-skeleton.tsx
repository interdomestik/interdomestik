import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import styles from './page-skeleton.module.css';

type SkeletonVariant = 'list' | 'detail' | 'dashboard';

type PageSkeletonProps = Readonly<{
  title: string;
  loadingLabel: string;
  variant: SkeletonVariant;
  testId?: string;
}>;

function Shape({ className }: Readonly<{ className: string }>): ReactElement {
  return <Skeleton aria-hidden="true" className={`motion-reduce:animate-none ${className}`} />;
}

function ListShapes(): ReactElement {
  return (
    <div className="space-y-4">
      <Shape className="h-10 w-full max-w-sm" />
      <div className="divide-y rounded-lg border">
        {['first', 'second', 'third', 'fourth', 'fifth'].map(row => (
          <div key={row} className="flex items-center gap-4 p-4">
            <Shape className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Shape className="h-4 w-2/3 max-w-xs" />
              <Shape className="h-3 w-1/2 max-w-sm" />
            </div>
            <Shape className="h-6 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailShapes(): ReactElement {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="space-y-4 rounded-lg border p-4 md:col-span-2">
        <Shape className="h-6 w-1/2" />
        <Shape className="h-4 w-full" />
        <Shape className="h-4 w-5/6" />
        <Shape className="h-40 w-full" />
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <Shape className="h-10 w-10 rounded-full" />
        <Shape className="h-4 w-2/3" />
        <Shape className="h-4 w-full" />
      </div>
    </div>
  );
}

function DashboardShapes(): ReactElement {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['first', 'second', 'third', 'fourth'].map(card => (
          <div key={card} className="space-y-4 rounded-lg border p-4">
            <Shape className="h-4 w-2/3" />
            <Shape className="h-9 w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Shape className="h-64 w-full" />
        <Shape className="h-64 w-full" />
      </div>
    </div>
  );
}

const VARIANT_SHAPES = {
  list: ListShapes,
  detail: DetailShapes,
  dashboard: DashboardShapes,
};

export function PageSkeleton({
  title,
  loadingLabel,
  variant,
  testId,
}: PageSkeletonProps): ReactElement {
  const Shapes = VARIANT_SHAPES[variant];

  return (
    <div aria-busy="true" className="min-w-0 space-y-6" data-testid={testId}>
      <h1 className="break-words text-3xl font-bold tracking-tight">{title}</h1>
      <output aria-live="polite" className="sr-only">
        {loadingLabel}
      </output>
      <div aria-hidden="true" className={styles.shapes}>
        <Shapes />
      </div>
    </div>
  );
}

/** Uses the enclosing role shell's locale, without reading route data. */
export function LocalizedPageSkeleton({
  titleKey,
  variant,
  testId,
}: Readonly<{
  titleKey: string;
  variant: SkeletonVariant;
  testId?: string;
}>): ReactElement {
  const t = useTranslations();

  return (
    <PageSkeleton
      title={t(titleKey)}
      loadingLabel={t('common.loading')}
      variant={variant}
      testId={testId}
    />
  );
}
