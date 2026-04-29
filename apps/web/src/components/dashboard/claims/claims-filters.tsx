'use client';

import { cn } from '@/lib/utils';
import { usePathname, useRouter } from '@/i18n/routing';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { badgeVariants, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useTransition } from 'react';

const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;

type PendingKind = 'filter' | 'search';

type FilterUiState = {
  pendingKind: PendingKind | null;
  searchValue: string;
};

type FilterUiAction =
  | { type: 'pending-changed'; pendingKind: PendingKind | null }
  | { type: 'search-edited'; searchValue: string };

function filterUiReducer(state: FilterUiState, action: FilterUiAction): FilterUiState {
  switch (action.type) {
    case 'pending-changed':
      if (state.pendingKind === action.pendingKind) {
        return state;
      }
      return { ...state, pendingKind: action.pendingKind };
    case 'search-edited':
      if (state.searchValue === action.searchValue) {
        return state;
      }
      return { ...state, searchValue: action.searchValue };
  }
}

function buildMemberClaimsUrl(
  currentParams: URLSearchParams,
  updates: Record<string, string | null>
): string {
  const params = new URLSearchParams(currentParams.toString());

  params.delete('page');

  Object.entries(updates).forEach(([key, value]) => {
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function ClaimsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('claims.status');

  const currentStatus = searchParams.get('status') || 'all';
  const currentSearch = searchParams.get('search') || '';
  const currentParamsString = searchParams.toString();

  const [filterUi, dispatchFilterUi] = useReducer(filterUiReducer, {
    pendingKind: null,
    searchValue: currentSearch,
  });
  const pendingKindRef = useRef<PendingKind | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const { pendingKind, searchValue } = filterUi;
  const isNavigationPending = Boolean(pendingKind || isTransitionPending);

  const updatePendingKind = useCallback((nextPendingKind: PendingKind | null) => {
    pendingKindRef.current = nextPendingKind;
    dispatchFilterUi({ type: 'pending-changed', pendingKind: nextPendingKind });
  }, []);

  useEffect(() => {
    dispatchFilterUi({ type: 'search-edited', searchValue: currentSearch });
  }, [currentSearch]);

  useEffect(() => {
    updatePendingKind(null);
  }, [currentParamsString, updatePendingKind]);

  useEffect(() => {
    if (!pendingKind) {
      return undefined;
    }

    const timeout = globalThis.setTimeout(
      () => updatePendingKind(null),
      PENDING_FEEDBACK_TIMEOUT_MS
    );
    return () => globalThis.clearTimeout(timeout);
  }, [pendingKind, updatePendingKind]);

  const statusOptions = [
    { value: 'all', label: tCommon('all') },
    ...CLAIM_STATUSES.map(status => ({ value: status, label: tStatus(status) })),
  ];

  const handleStatusChange = (status: string) => {
    if (pendingKindRef.current || currentStatus === status) {
      return;
    }

    const nextUrl = buildMemberClaimsUrl(searchParams, { status });
    const currentUrl = currentParamsString ? `?${currentParamsString}` : '';

    if (nextUrl === currentUrl) {
      return;
    }

    updatePendingKind('filter');

    startTransition(() => {
      router.push(`${pathname}${nextUrl}`, { scroll: false });
    });
  };

  const handleSearch = (value: string) => {
    dispatchFilterUi({ type: 'search-edited', searchValue: value });

    if (pendingKindRef.current === 'filter') {
      return;
    }

    const nextUrl = buildMemberClaimsUrl(searchParams, { search: value || null });
    const currentUrl = currentParamsString ? `?${currentParamsString}` : '';

    if (nextUrl === currentUrl) {
      return;
    }

    updatePendingKind('search');

    startTransition(() => {
      router.push(`${pathname}${nextUrl}`, { scroll: false });
    });
  };

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
