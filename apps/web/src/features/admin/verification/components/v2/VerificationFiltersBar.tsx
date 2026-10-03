'use client';

import { Clock, History } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OpsFiltersBar } from '@/components/ops';

interface VerificationFiltersBarProps {
  view: 'queue' | 'history';
  onViewChange: (view: 'queue' | 'history') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** A real filter navigation is outstanding: tabs and input stay blocked. */
  isFilterPending?: boolean;
  /** Any navigation is outstanding, including a coalesced search commit. */
  isBusy?: boolean;
}

export function VerificationFiltersBar({
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
  isFilterPending = false,
  isBusy = false,
}: Readonly<VerificationFiltersBarProps>) {
  const t = useTranslations('admin.leads');
  const tCommon = useTranslations('common');

  // Pending feedback lives in this verification wrapper so the shared ops bar
  // keeps its contract: it only learns about a real filter navigation, which
  // is what blocks its tabs. A queued search stays busy but fully editable.
  return (
    <div aria-busy={isBusy || undefined} data-testid="verification-filters">
      <OpsFiltersBar
        tabs={[
          {
            id: 'queue',
            label: t('tabs.queue'),
            icon: <Clock className="w-4 h-4" />,
            testId: 'view-queue',
          },
          {
            id: 'history',
            label: t('tabs.history'),
            icon: <History className="w-4 h-4" />,
            testId: 'view-history',
          },
        ]}
        activeTab={view}
        onTabChange={tabId => onViewChange(tabId as 'queue' | 'history')}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder={t('search_placeholder')}
        searchInputTestId="verification-search-input"
        isPending={isFilterPending}
        searchDisabled={isFilterPending}
      />
      {isBusy ? (
        <p role="status" className="sr-only" data-testid="verification-search-pending">
          {tCommon('loading')}
        </p>
      ) : null}
    </div>
  );
}
