'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useTransition } from 'react';

export const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;
// Trailing coalescing window for search-only navigation: a deliberate small UI
// delay so one typing burst starts one client navigation instead of one per
// keystroke. Local input edits and their pending feedback stay immediate.
export const SEARCH_COMMIT_DELAY_MS = 250;

export type PendingKind = 'filter' | 'search';

type ScheduledSearch = {
  term: string;
  timer: ReturnType<typeof globalThis.setTimeout>;
};

type FilterUiState = {
  pendingKind: PendingKind | null;
  searchValue: string;
};

type FilterUiAction =
  | { type: 'pending-changed'; pendingKind: PendingKind | null }
  | { type: 'search-edited'; searchValue: string };

export type MemberClaimsSearch = {
  currentStatus: string;
  searchValue: string;
  pendingKind: PendingKind | null;
  isNavigationPending: boolean;
  handleSearch: (value: string) => void;
  handleStatusChange: (status: string) => void;
  cancelSearchForNavigation: () => void;
};

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
    const shouldDelete = value === null || value === '' || (key === 'status' && value === 'all');

    if (shouldDelete) {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useMemberClaimsSearch(): MemberClaimsSearch {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') || 'all';
  const currentSearch = searchParams.get('search') || '';
  const currentParamsString = searchParams.toString();
  const currentUrl = currentParamsString ? `?${currentParamsString}` : '';

  const [filterUi, dispatchFilterUi] = useReducer(filterUiReducer, {
    pendingKind: null,
    searchValue: currentSearch,
  });
  const pendingKindRef = useRef<PendingKind | null>(null);
  const scheduledSearchRef = useRef<ScheduledSearch | null>(null);
  // Full urls we pushed ourselves, oldest first, each awaiting its async echo.
  const issuedUrlsRef = useRef<string[]>([]);
  const latestSearchTermRef = useRef(currentSearch);
  const [isTransitionPending, startTransition] = useTransition();
  const { pendingKind, searchValue } = filterUi;
  const isNavigationPending = Boolean(pendingKind || isTransitionPending);

  const updatePendingKind = useCallback((nextPendingKind: PendingKind | null) => {
    pendingKindRef.current = nextPendingKind;
    dispatchFilterUi({ type: 'pending-changed', pendingKind: nextPendingKind });
  }, []);

  const cancelScheduledSearch = useCallback(() => {
    const scheduled = scheduledSearchRef.current;

    if (scheduled) {
      globalThis.clearTimeout(scheduled.timer);
      scheduledSearchRef.current = null;
    }
  }, []);

  const navigate = useCallback(
    (updates: Record<string, string | null>, kind: PendingKind): boolean => {
      const nextUrl = buildMemberClaimsUrl(searchParams, updates);

      if (nextUrl === currentUrl) {
        return false;
      }

      issuedUrlsRef.current.push(`${pathname}${nextUrl}`);
      updatePendingKind(kind);

      startTransition(() => {
        router.push(`${pathname}${nextUrl}`, { scroll: false });
      });

      return true;
    },
    [currentUrl, pathname, router, searchParams, updatePendingKind]
  );

  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const commitSearchTerm = useCallback(
    (term: string) => {
      scheduledSearchRef.current = null;

      if (navigateRef.current({ search: term || null }, 'search')) {
        return;
      }

      // The term already is the committed url: never leave stale feedback,
      // unless an earlier commit of ours is still awaiting its echo.
      if (pendingKindRef.current === 'search' && issuedUrlsRef.current.length === 0) {
        updatePendingKind(null);
      }
    },
    [updatePendingKind]
  );

  const scheduleSearchCommit = useCallback(
    (term: string) => {
      const timer = globalThis.setTimeout(() => commitSearchTerm(term), SEARCH_COMMIT_DELAY_MS);
      scheduledSearchRef.current = { term, timer };
    },
    [commitSearchTerm]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const markPopState = () => {
      // Cancel before React observes the destination, including same-query Back.
      cancelScheduledSearch();
      issuedUrlsRef.current.length = 0;
      const destinationParams = new URLSearchParams(window.location.search);
      const term = destinationParams.get('search') || '';
      latestSearchTermRef.current = term;
      dispatchFilterUi({ type: 'search-edited', searchValue: term });
      // Keep controls inert until the router exposes the adopted destination.
      updatePendingKind(destinationParams.toString() === currentParamsString ? null : 'filter');
    };

    window.addEventListener('popstate', markPopState);
    return () => window.removeEventListener('popstate', markPopState);
  }, [cancelScheduledSearch, currentParamsString, updatePendingKind]);

  // Url identity, not search identity: a status or page change that keeps the
  // same committed term is still a real navigation and cancels obsolete work.
  useEffect(() => {
    const issuedUrls = issuedUrlsRef.current;
    const echoIndex = issuedUrls.lastIndexOf(`${pathname}${currentUrl}`);

    if (echoIndex >= 0) {
      issuedUrls.splice(0, echoIndex + 1);

      if (issuedUrls.length > 0 || scheduledSearchRef.current) {
        return;
      }

      if (latestSearchTermRef.current === currentSearch) {
        updatePendingKind(null);
        return;
      }

      // The echo disagrees with the latest local term: converge instead of
      // leaving url and input split.
      scheduleSearchCommit(latestSearchTermRef.current);
      return;
    }

    // External link, back/forward or server redirect: it wins outright.
    issuedUrls.length = 0;
    cancelScheduledSearch();
    latestSearchTermRef.current = currentSearch;
    dispatchFilterUi({ type: 'search-edited', searchValue: currentSearch });
    updatePendingKind(null);
  }, [
    cancelScheduledSearch,
    currentSearch,
    currentUrl,
    pathname,
    scheduleSearchCommit,
    updatePendingKind,
  ]);

  useEffect(() => {
    if (!pendingKind) {
      return undefined;
    }

    const timeout = globalThis.setTimeout(
      () => updatePendingKind(null),
      PENDING_FEEDBACK_TIMEOUT_MS
    );
    return () => globalThis.clearTimeout(timeout);
  }, [pendingKind, searchValue, updatePendingKind]);

  useEffect(() => {
    return () => {
      cancelScheduledSearch();
    };
  }, [cancelScheduledSearch]);

  const handleStatusChange = useCallback(
    (status: string) => {
      if (pendingKindRef.current || currentStatus === status) {
        return;
      }

      navigate({ status }, 'filter');
    },
    [currentStatus, navigate]
  );

  const handleSearch = useCallback(
    (value: string) => {
      dispatchFilterUi({ type: 'search-edited', searchValue: value });

      if (pendingKindRef.current === 'filter') {
        return;
      }

      latestSearchTermRef.current = value;
      cancelScheduledSearch();

      const nextUrl = buildMemberClaimsUrl(searchParams, { search: value || null });

      // Existing same-query no-op: nothing to commit and nothing outstanding.
      if (nextUrl === currentUrl && issuedUrlsRef.current.length === 0) {
        updatePendingKind(null);
        return;
      }

      // Existing per-edit search feedback is kept: only the navigation is
      // deferred, so status chips keep their blocked-while-pending rule.
      updatePendingKind('search');
      scheduleSearchCommit(value);
    },
    [cancelScheduledSearch, currentUrl, scheduleSearchCommit, searchParams, updatePendingKind]
  );

  const cancelSearchForNavigation = useCallback(() => {
    if (pendingKindRef.current !== 'search') return;
    cancelScheduledSearch();
    issuedUrlsRef.current.length = 0;
    updatePendingKind('filter');
  }, [cancelScheduledSearch, updatePendingKind]);

  return {
    currentStatus,
    searchValue,
    pendingKind,
    isNavigationPending,
    handleSearch,
    handleStatusChange,
    cancelSearchForNavigation,
  };
}
