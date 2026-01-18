'use client';

import { Clock, History } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OpsFiltersBar } from '@/components/ops';

interface VerificationFiltersBarProps {
  view: 'queue' | 'history';
  onViewChange: (view: 'queue' | 'history') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function VerificationFiltersBar({
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
}: VerificationFiltersBarProps) {
  const t = useTranslations('admin.leads');

  return (
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
    />
  );
}
