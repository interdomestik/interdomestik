// Phase 2.8: Work Center Component
'use client';

import { Button } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import type { ClaimOperationalRow } from '../../types';
import { PrioritizedList } from './PrioritizedList';
import { buildQueueUrl } from './utils';

interface WorkCenterProps {
  claims: ClaimOperationalRow[];
  hasMore: boolean;
  currentPage: number;
}

/**
 * WorkCenter — Center pane containing prioritized claims (Scrollable).
 */
export function WorkCenter({ claims, hasMore, currentPage }: WorkCenterProps) {
  const t = useTranslations('admin.claims_page.ops_center');
  const searchParams = useSearchParams();

  const locale = useLocale();

  // Build load more URL
  // Build load more URL using centralized builder
  // We pass 'page' explicitly, so it overrides the default page reset logic
  const loadMoreUrl = buildQueueUrl(`/${locale}/admin/claims`, searchParams, {
    page: String(currentPage + 1),
  });

  return (
    <section className="flex-1 min-w-0 py-4 px-4 overflow-y-auto" data-testid="work-center">
      <h2 className="text-sm font-medium text-muted-foreground mb-4">
        {t('prioritized_list.title')}
      </h2>
      <PrioritizedList claims={claims} />

      {hasMore && (
        <div className="mt-4 flex justify-center pb-8">
          <Button asChild variant="outline" data-testid="load-more-button">
            <a href={loadMoreUrl}>{t('prioritized_list.load_more')}</a>
          </Button>
        </div>
      )}
    </section>
  );
}
