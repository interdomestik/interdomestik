'use client';

import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import type { ClaimStatus } from '@/lib/api/claims';
import { cn } from '@/lib/utils';
import { Input } from '@interdomestik/ui';
import { Check, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useSyncExternalStore } from 'react';
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

// The route mounts one filter and one list as siblings.
const navigationListeners = new Set<() => void>();
let filterNavigationPending = false;

function subscribeToFilterNavigation(listener: () => void) {
  navigationListeners.add(listener);
  return () => {
    navigationListeners.delete(listener);
  };
}

function publishFilterNavigation(pending: boolean) {
  if (filterNavigationPending === pending) return;
  filterNavigationPending = pending;
  for (const listener of navigationListeners) listener();
}

export function useMemberClaimsFilterPending() {
  return useSyncExternalStore(
    subscribeToFilterNavigation,
    () => filterNavigationPending,
    () => false
  );
}

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
  useEffect(() => {
    publishFilterNavigation(isNavigationPending);
    return () => publishFilterNavigation(false);
  }, [isNavigationPending]);

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
        <div className="relative sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70"
          />
          <Input
            id={searchId}
            placeholder={t('memberList.searchPlaceholder')}
            className="h-11 min-w-11 border-foreground/60 bg-[hsl(var(--surface))] ps-9 placeholder:text-foreground/70 focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:focus-visible:outline"
            data-testid="member-claims-search-input"
            readOnly={pendingKind === 'filter'}
            value={searchValue}
            onChange={e => {
              if (pendingKind !== 'filter') handleSearch(e.target.value);
            }}
          />
        </div>
      </div>

      {pendingKind ? (
        <div
          data-testid="member-claims-pending"
          role="status"
          className="text-sm text-foreground/70"
        >
          {tCommon('processing')}
        </div>
      ) : null}

      <fieldset className="flex min-w-0 flex-wrap gap-2">
        <legend className="sr-only">{t('table.status')}</legend>
        {statusOptions.map(option => {
          const isActive = currentStatus === option.value;
          const isInert = isNavigationPending || isActive;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              aria-disabled={isInert}
              data-testid={`member-claims-status-filter-${option.value}`}
              className={cn(
                'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium sm:min-h-9 sm:min-w-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:cursor-default forced-colors:border-[CanvasText] forced-colors:focus-visible:outline',
                isActive
                  ? 'border-primary bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))] forced-colors:border-[Highlight]'
                  : 'border-foreground/60 text-foreground hover:bg-[hsl(var(--surface-strong))]'
              )}
              onClick={() => {
                if (!isInert) handleStatusChange(option.value);
              }}
            >
              {isActive && <Check aria-hidden="true" className="size-4 shrink-0" />}
              {option.label}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
