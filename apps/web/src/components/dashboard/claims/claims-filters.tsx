'use client';

import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { cn } from '@/lib/utils';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { badgeVariants, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemberClaimsSearch } from './use-member-claims-search';

export function ClaimsFilters() {
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('claims.status');
  const {
    currentStatus,
    searchValue,
    pendingKind,
    isNavigationPending,
    handleSearch,
    handleStatusChange,
    cancelSearchForNavigation,
  } = useMemberClaimsSearch();

  useSiblingNavigationCancel(cancelSearchForNavigation);

  const statusOptions = [
    { value: 'all', label: tCommon('all') },
    ...CLAIM_STATUSES.map(status => ({ value: status, label: tStatus(status) })),
  ];

  return (
    <div
      className="space-y-4"
      data-testid="member-claims-filter-region"
      aria-busy={isNavigationPending ? 'true' : 'false'}
    >
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`${tCommon('search')}...`}
          className="pl-9"
          data-testid="member-claims-search-input"
          disabled={pendingKind === 'filter'}
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {pendingKind ? (
        <div
          data-testid="member-claims-pending"
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-muted-foreground"
        >
          {tCommon('processing')}
        </div>
      ) : null}

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map(option => {
          const isActive = currentStatus === option.value;
          const isInert = isNavigationPending || isActive;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              aria-disabled={isInert}
              disabled={isInert}
              data-testid={`member-claims-status-filter-${option.value}`}
              className={cn(
                badgeVariants({ variant: isActive ? 'default' : 'outline' }),
                'cursor-pointer hover:bg-primary/10 transition-colors disabled:pointer-events-none disabled:cursor-default disabled:opacity-70'
              )}
              onClick={() => handleStatusChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
