'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { PageSkeleton, type PageSkeletonProps } from './page-skeleton';

/** Read the role shell's client provider without resolving server request config. */
export function LocalizedPageSkeleton({
  titleKey,
  variant,
  testId,
  titleSize,
}: Readonly<{
  titleKey: string;
  variant: PageSkeletonProps['variant'];
  testId?: string;
  titleSize?: NonNullable<PageSkeletonProps['titleSize']>;
}>): ReactElement {
  const t = useTranslations();

  return (
    <PageSkeleton
      title={t(titleKey)}
      loadingLabel={t('common.loading')}
      variant={variant}
      testId={testId}
      titleSize={titleSize}
    />
  );
}
