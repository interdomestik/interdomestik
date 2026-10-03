'use client';

import {
  applyQueryUpdates,
  type SearchParamUpdates,
  type SearchPendingKind,
  useResponsiveSearch,
} from '@/hooks/use-responsive-search';
import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

// Re-exported so existing member callers and tests keep their contract: the
// shared policy owns the values, this family owns its param rules.
export { PENDING_FEEDBACK_TIMEOUT_MS, SEARCH_COMMIT_DELAY_MS } from '@/hooks/use-responsive-search';

export type PendingKind = SearchPendingKind;

export type MemberClaimsSearch = {
  currentStatus: string;
  searchValue: string;
  pendingKind: PendingKind | null;
  isNavigationPending: boolean;
  handleSearch: (value: string) => void;
  handleStatusChange: (status: string) => void;
  cancelSearchForNavigation: (nextPendingKind?: PendingKind | null) => void;
};

// Member claims param policy: any committed change drops pagination, and the
// status sentinel 'all' clears the param instead of writing it. A literal
// 'all' search term is unaffected.
function buildMemberClaimsQuery(
  currentParams: URLSearchParams,
  updates: SearchParamUpdates
): string {
  const params = new URLSearchParams(currentParams.toString());

  params.delete('page');

  const normalizedUpdates: SearchParamUpdates = {};
  Object.entries(updates).forEach(([key, value]) => {
    normalizedUpdates[key] = key === 'status' && value === 'all' ? null : value;
  });

  return applyQueryUpdates(params, normalizedUpdates);
}

export function useMemberClaimsSearch(): MemberClaimsSearch {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') || 'all';

  const navigate = useCallback(
    (query: string) => router.push(pathname + (query ? `?${query}` : ''), { scroll: false }),
    [pathname, router]
  );

  const {
    draft,
    pendingKind,
    isNavigationPending,
    editDraft,
    requestNavigation,
    cancelScheduledSearch,
    getPendingKind,
  } = useResponsiveSearch({
    searchParams,
    pathname,
    searchKey: 'search',
    buildQuery: buildMemberClaimsQuery,
    navigate,
  });

  const handleStatusChange = useCallback(
    (status: string) => {
      if (getPendingKind() || currentStatus === status) {
        return;
      }

      requestNavigation({ status }, 'filter');
    },
    [currentStatus, getPendingKind, requestNavigation]
  );

  // A sibling navigation defaults to owning the url ('filter'); an explicit
  // navigation that keeps this url passes null so nothing stays pending.
  const cancelSearchForNavigation = useCallback(
    (nextPendingKind: PendingKind | null = 'filter') => cancelScheduledSearch(nextPendingKind),
    [cancelScheduledSearch]
  );

  return {
    currentStatus,
    searchValue: draft,
    pendingKind,
    isNavigationPending,
    handleSearch: editDraft,
    handleStatusChange,
    cancelSearchForNavigation,
  };
}
