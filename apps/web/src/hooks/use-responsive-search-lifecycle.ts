'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { SearchOwnership } from './responsive-search-ownership';
import { routeKey, type SearchPendingKind } from './responsive-search-policy';

type LifecycleOptions = {
  ownership: SearchOwnership;
  committedRef: RefObject<{ key: string; term: string; hasTerm: boolean }>;
  observedKeyRef: RefObject<string>;
  pendingKindRef: RefObject<SearchPendingKind | null>;
  adoptCommitted: (term: string, pending: SearchPendingKind | null) => void;
  updatePendingKind: (pending: SearchPendingKind | null, renew?: boolean) => void;
  currentKey: string;
  searchKey: string;
};

export function useResponsiveSearchLifecycle({
  ownership,
  committedRef,
  observedKeyRef,
  pendingKindRef,
  adoptCommitted,
  updatePendingKind,
  currentKey,
  searchKey,
}: LifecycleOptions): void {
  const reconnectRequiresAdoption = useRef(false);
  // Lifecycle, not dependencies. Mount, a React Activity reveal and a
  // StrictMode remount all reconnect effects here; ordinary renders and
  // dependency updates never do, so a live draft is never cleared by one.
  // While a tree is hidden its effects are gone, so a popstate can be missed
  // and any pending ownership it held describes a url that may not exist any
  // more: reconcile against the url the router exposes on this connect.
  useEffect(() => {
    const committed = committedRef.current;
    const shouldAdopt =
      committed.hasTerm ||
      reconnectRequiresAdoption.current ||
      observedKeyRef.current !== committed.key;
    reconnectRequiresAdoption.current = false;
    ownership.abandon();
    observedKeyRef.current = committed.key;

    if (shouldAdopt) {
      adoptCommitted(committed.term, null);
    } else {
      // No committed term for this family: keep the draft seed, but never keep
      // ownership that was abandoned together with the hidden effects.
      updatePendingKind(null);
    }

    return () => {
      // Hidden or unmounted: abandon queued timers and echo ownership so a
      // handler retained by this tree can never issue superseded work.
      reconnectRequiresAdoption.current =
        pendingKindRef.current !== null || ownership.awaitingEcho() || ownership.hasScheduled();
      ownership.abandon();
    };
  }, [adoptCommitted, ownership, pendingKindRef, updatePendingKind]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const markPopState = () => {
      // Cancel before React observes the destination, including same-query Back.
      ownership.abandon();
      const destinationParams = new URLSearchParams(window.location.search);
      const destinationKey = routeKey(window.location.pathname, destinationParams.toString());
      // Stay inert until the router exposes the adopted destination. Back to
      // another route with the same query is still a real navigation, so this
      // now stale adapter must not commit anything through it.
      adoptCommitted(
        destinationParams.get(searchKey) || '',
        destinationKey === currentKey ? null : 'filter'
      );
    };

    window.addEventListener('popstate', markPopState);
    return () => window.removeEventListener('popstate', markPopState);
  }, [adoptCommitted, currentKey, ownership, searchKey]);
}
