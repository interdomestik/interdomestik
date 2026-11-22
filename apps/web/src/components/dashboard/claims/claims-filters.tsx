'use client';

import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import type { ClaimStatus } from '@/lib/api/claims';
import { cn } from '@/lib/utils';
import { Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useMemberClaimsSearch } from './use-member-claims-search';

const MEMBER_STATUS_OPTIONS = {
  draft: 'draft',
  submitted: 'submitted',
  submitted_to_airline: 'submitted_to_airline',
  verification: 'verification',
  evaluation: 'evaluation',
  negotiation: 'negotiation',
  court: 'court',
  resolved: 'resolved',
  rejected: 'rejected',
} as const satisfies { [Status in ClaimStatus]: Status };

export function ClaimsFilters() {
  const tCommon = useTranslations('common');
  const t = useTranslations('claims');
  const tStatus = useTranslations('claims.status');
  const searchId = useId();
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
    ...Object.values(MEMBER_STATUS_OPTIONS).map(status => ({
      value: status,
      label: tStatus(status),
    })),
  ];

  return (
    <div
      className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-4 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]"
      data-testid="member-claims-filter-region"
      aria-busy={isNavigationPending ? 'true' : 'false'}
    >
      <div className="space-y-2">
        <label htmlFor={searchId} className="block text-sm font-semibold">
          {tCommon('search')}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70"
          />
          <Input
            id={searchId}
            placeholder={t('memberList.searchPlaceholder')}
            className="h-11 min-w-11 border-foreground/60 bg-[hsl(var(--surface))] ps-9 placeholder:text-foreground/70 forced-colors:focus-visible:outline"
            data-testid="member-claims-search-input"
            disabled={pendingKind === 'filter'}
            value={searchValue}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {pendingKind ? (
        <div
          data-testid="member-claims-pending"
          role="status"
          aria-live="polite"
          className="text-sm text-foreground/70"
        >
          {tCommon('processing')}
        </div>
      ) : null}

      <div aria-label={t('table.status')} className="flex flex-wrap gap-2" role="group">
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
                'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-full border px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 enabled:hover:bg-[hsl(var(--surface-strong))] disabled:cursor-default forced-colors:border-[CanvasText] forced-colors:focus-visible:outline',
                isActive
                  ? 'border-primary bg-[hsl(var(--primary-soft))] font-semibold forced-colors:border-[Highlight]'
                  : 'border-foreground/60'
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
