'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { SearchOwnership } from './responsive-search-ownership';
import type { SearchParamUpdates, SearchPendingKind } from './responsive-search-policy';

type CommitOptions = {
  requestNavigation: (updates: SearchParamUpdates, kind: SearchPendingKind) => boolean;
  ownership: SearchOwnership;
  pendingKindRef: RefObject<SearchPendingKind | null>;
  searchKey: string;
  delayMs: number;
  updatePendingKind: (pending: SearchPendingKind | null, renew?: boolean) => void;
};

export function useResponsiveSearchCommit({
  requestNavigation,
  ownership,
  pendingKindRef,
  searchKey,
  delayMs,
  updatePendingKind,
}: CommitOptions): (term: string) => void {
  const requestNavigationRef = useRef(requestNavigation);

  useEffect(() => {
    requestNavigationRef.current = requestNavigation;
  }, [requestNavigation]);

  const commitTerm = useCallback(
    (term: string) => {
      if (requestNavigationRef.current({ [searchKey]: term || null }, 'search')) {
        return;
      }

      // The term already is the committed url: never leave stale feedback,
      // unless an earlier commit of ours is still awaiting its echo.
      if (pendingKindRef.current === 'search' && !ownership.awaitingEcho()) {
        updatePendingKind(null);
      }
    },
    [ownership, pendingKindRef, searchKey, updatePendingKind]
  );

  const scheduleCommit = useCallback(
    (term: string) => {
      ownership.schedule(term, delayMs, commitTerm);
    },
    [commitTerm, delayMs, ownership]
  );

  return scheduleCommit;
}
