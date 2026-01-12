// Phase 2.7: Work Center Component
'use client';

import { Button } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import type { ClaimOperationalRow } from '../../types';
import { PrioritizedList } from './PrioritizedList';

interface WorkCenterProps {
  claims: ClaimOperationalRow[];
  hasMore: boolean;
  currentPage: number;
  selectedClaimId?: string;
  onSelectClaim?: (claim: ClaimOperationalRow) => void;
}

/**
 * WorkCenter — Center pane containing prioritized claims (Scrollable).
 */
export function WorkCenter({
  claims,
  hasMore,
  currentPage,
  selectedClaimId,
  onSelectClaim,
}: WorkCenterProps) {
  const t = useTranslations('admin.claims_page.ops_center');
  const searchParams = useSearchParams();

  const locale = useLocale();

  // Build load more URL
  const loadMoreUrl = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(currentPage + 1));
    return `/${locale}/admin/claims?${params.toString()}`;
  })();

  return (
    <main className="flex-1 min-w-0 py-4 px-4 overflow-y-auto" data-testid="work-center">
      <h2 className="text-sm font-medium text-muted-foreground mb-4">
        {t('prioritized_list.title')}
      </h2>
      <PrioritizedList
        claims={claims}
        selectedClaimId={selectedClaimId}
        onSelectClaim={onSelectClaim}
      />

      {hasMore && (
        <div className="mt-4 flex justify-center pb-8">
          <Button asChild variant="outline" data-testid="load-more-button">
            <a href={loadMoreUrl}>{t('prioritized_list.load_more')}</a>
          </Button>
        </div>
      )}
    </main>
  );
}
