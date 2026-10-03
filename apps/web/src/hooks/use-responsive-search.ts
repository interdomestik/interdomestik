'use client';

import { useCallback, useEffect, useReducer, useRef, useTransition } from 'react';
import { useResponsiveSearchCommit } from './use-responsive-search-commit';
import { useResponsiveSearchLifecycle } from './use-responsive-search-lifecycle';
import { createSearchOwnership, type SearchOwnership } from './responsive-search-ownership';
import {
  applyQueryUpdates,
  PENDING_FEEDBACK_TIMEOUT_MS,
  resolveInitialDraft,
  routeKey,
  SEARCH_COMMIT_DELAY_MS,
  searchUiReducer,
  type ResponsiveSearch,
  type ResponsiveSearchAdapter,
  type SearchParamUpdates,
  type SearchPendingKind,
} from './responsive-search-policy';

// Automatic network search updates drafts immediately and coalesces navigation.
// Policy and ownership modules hold query rules, timers and echo bookkeeping.
// This hook reconciles URL ownership with React state, recovery and retained routes.
export {
  applyQueryUpdates,
  PENDING_FEEDBACK_TIMEOUT_MS,
  SEARCH_COMMIT_DELAY_MS,
} from './responsive-search-policy';
export type {
  ResponsiveSearch,
  ResponsiveSearchAdapter,
  SearchParamUpdates,
  SearchPendingKind,
} from './responsive-search-policy';

export function useResponsiveSearch(adapter: ResponsiveSearchAdapter): ResponsiveSearch {
  const { searchKey, searchParams } = adapter;
  const pathname = adapter.pathname ?? '';
  const delayMs = adapter.delayMs ?? SEARCH_COMMIT_DELAY_MS;
  const pendingTimeoutMs = adapter.pendingTimeoutMs ?? PENDING_FEEDBACK_TIMEOUT_MS;

  const committedTerm = searchParams.get(searchKey);
  const currentTerm = committedTerm || '';
  const currentKey = routeKey(pathname, searchParams.toString());

  const [ui, dispatchUi] = useReducer(searchUiReducer, {
    pendingKind: null,
    pendingEpoch: 0,
    draft: resolveInitialDraft(searchParams, searchKey, adapter.initialDraft),
  });
  const { draft, pendingEpoch, pendingKind } = ui;

  const ownershipRef = useRef<SearchOwnership | null>(null);
  ownershipRef.current ??= createSearchOwnership();
  const ownership = ownershipRef.current;

  const adapterRef = useRef(adapter);
  const pendingKindRef = useRef<SearchPendingKind | null>(null);
  const latestTermRef = useRef(currentTerm);
  const observedKeyRef = useRef(currentKey);
  // Last committed url this hook rendered with, readable from a lifecycle
  // effect that must not depend on it.
  const committedRef = useRef({
    key: currentKey,
    term: currentTerm,
    hasTerm: committedTerm !== null,
  });
  const [isTransitionPending, startTransition] = useTransition();

  useEffect(() => {
    adapterRef.current = adapter;
    committedRef.current = { key: currentKey, term: currentTerm, hasTerm: committedTerm !== null };
  });

  const updatePendingKind = useCallback(
    (nextPendingKind: SearchPendingKind | null, renew = false) => {
      // A newer navigation of the same kind is still a new owner of the pending
      // feedback, even when the raw draft is unchanged.
      const isNewOwner =
        pendingKindRef.current !== nextPendingKind || (renew && nextPendingKind !== null);
      pendingKindRef.current = nextPendingKind;

      if (!isNewOwner) {
        return;
      }

      // The owner id is claimed synchronously, inside this event: a recovery
      // callback that already left the timer queue is inert from here on, even
      // if it runs before React reconnects the recovery effect's cleanup.
      dispatchUi({
        type: 'pending-changed',
        pendingKind: nextPendingKind,
        renew,
        epoch: ownership.claimOwner(),
      });
    },
    [ownership]
  );

  // Adoption: the committed url wins over whatever this tree still held.
  const adoptCommitted = useCallback(
    (term: string, nextPendingKind: SearchPendingKind | null) => {
      latestTermRef.current = term;
      dispatchUi({ type: 'draft-edited', draft: term });
      updatePendingKind(nextPendingKind, true);
    },
    [updatePendingKind]
  );

  const buildTarget = useCallback(
    (updates: SearchParamUpdates) => {
      const buildQuery = adapterRef.current.buildQuery ?? applyQueryUpdates;
      const query = buildQuery(searchParams, updates);
      return { key: routeKey(pathname, query), query };
    },
    [pathname, searchParams]
  );

  const requestNavigation = useCallback(
    (updates: SearchParamUpdates, kind: SearchPendingKind): boolean => {
      const { key, query } = buildTarget(updates);

      // Whoever navigates now owns the url: drop any queued draft commit
      // synchronously, inside this event, before the navigation starts. This
      // cannot abort a navigation that already reached the router.
      ownership.clearScheduled();

      if (key === currentKey) {
        return false;
      }

      // Remember the kind too: a filter echo adopts, a search echo converges.
      ownership.issue(key, kind);
      updatePendingKind(kind, true);

      startTransition(() => {
        adapterRef.current.navigate(query);
      });

      return true;
    },
    [buildTarget, currentKey, ownership, updatePendingKind]
  );

  const scheduleCommit = useResponsiveSearchCommit({
    requestNavigation,
    ownership,
    pendingKindRef,
    searchKey,
    delayMs,
    updatePendingKind,
  });

  useResponsiveSearchLifecycle({
    ownership,
    committedRef,
    observedKeyRef,
    pendingKindRef,
    adoptCommitted,
    updatePendingKind,
    currentKey,
    searchKey,
  });

  // Url identity, not term identity: a filter or page change that keeps the
  // same committed term is still a real navigation and cancels obsolete work.
  useEffect(() => {
    const echo = ownership.takeEchoIntent(currentKey);
    // Mount, or a re-registered effect on the same committed url: nothing new.
    const isAlreadyObserved = observedKeyRef.current === currentKey;
    observedKeyRef.current = currentKey;

    // Filter adoption only wins while that filter is still the latest intent.
    // Releasing stuck feedback is not an intent, so a filter awaited across
    // recovery still adopts; an edit or navigation accepted after it supersedes
    // this echo, which then converges like one of our own search echoes.
    if (echo?.kind === 'filter' && echo.isCurrentIntent) {
      // Our own filter navigation landed: the draft queued before it is obsolete.
      // It must not come back and must never schedule convergence work of its own.
      ownership.clearScheduled();
      latestTermRef.current = currentTerm;
      dispatchUi({ type: 'draft-edited', draft: currentTerm });

      if (!ownership.awaitingEcho()) {
        updatePendingKind(null);
      }

      return;
    }

    if (echo) {
      if (ownership.awaitingEcho() || ownership.hasScheduled()) {
        return;
      }

      if (latestTermRef.current === currentTerm) {
        updatePendingKind(null);
        return;
      }

      // The echo disagrees with the latest local term: converge instead of
      // leaving url and input split, and keep truthful feedback - queued
      // convergence work must never be reported as settled.
      updatePendingKind('search', true);
      scheduleCommit(latestTermRef.current);
      return;
    }

    if (isAlreadyObserved) {
      return;
    }

    // External link, back/forward or server redirect: it wins outright.
    ownership.abandon();
    adoptCommitted(currentTerm, null);
  }, [adoptCommitted, currentKey, currentTerm, ownership, scheduleCommit, updatePendingKind]);

  // Recovery releases feedback that is truly stuck, never a newer owner's.
  useEffect(() => {
    if (!pendingKind) {
      return undefined;
    }

    const owner = pendingEpoch;
    const timeout = globalThis.setTimeout(() => {
      if (ownership.owner() !== owner) {
        return;
      }

      updatePendingKind(null);
    }, pendingTimeoutMs);

    return () => globalThis.clearTimeout(timeout);
  }, [draft, ownership, pendingEpoch, pendingKind, pendingTimeoutMs, updatePendingKind]);

  const editDraft = useCallback(
    (value: string) => {
      dispatchUi({ type: 'draft-edited', draft: value });

      // A filter navigation owns the url right now: keep the text, stay quiet.
      if (pendingKindRef.current === 'filter') {
        return;
      }

      const normalizeTerm = adapterRef.current.normalizeTerm;
      const term = normalizeTerm ? normalizeTerm(value) : value;
      latestTermRef.current = term;
      ownership.clearScheduled();

      const { key } = buildTarget({ [searchKey]: term || null });

      // Same-query no-op: nothing to commit and nothing outstanding.
      if (key === currentKey && !ownership.awaitingEcho()) {
        updatePendingKind(null);
        return;
      }

      // Per-edit feedback stays immediate: only the navigation is deferred.
      // Taking ownership here is synchronous, so an older recovery callback
      // cannot clear the feedback this keystroke just showed.
      updatePendingKind('search', true);
      scheduleCommit(term);
    },
    [buildTarget, currentKey, ownership, scheduleCommit, searchKey, updatePendingKind]
  );

  const cancelScheduledSearch = useCallback(
    (nextPendingKind: SearchPendingKind | null = 'filter') => {
      if (pendingKindRef.current !== 'search') {
        return;
      }

      ownership.abandon();

      // An explicit navigation that keeps this url settles it here: no stale
      // draft, and no pending feedback waiting ten seconds for an echo that
      // will never arrive.
      if (nextPendingKind === null) {
        latestTermRef.current = currentTerm;
        dispatchUi({ type: 'draft-edited', draft: currentTerm });
      }

      updatePendingKind(nextPendingKind);
    },
    [currentTerm, ownership, updatePendingKind]
  );

  const getPendingKind = useCallback(() => pendingKindRef.current, []);

  return {
    draft,
    pendingKind,
    isNavigationPending: Boolean(pendingKind || isTransitionPending),
    editDraft,
    requestNavigation,
    cancelScheduledSearch,
    getPendingKind,
  };
}
