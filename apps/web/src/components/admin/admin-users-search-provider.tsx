'use client';
import {
  normalizeRoutePath,
  PENDING_FEEDBACK_TIMEOUT_MS,
  routeKey,
  SEARCH_COMMIT_DELAY_MS,
} from '@/hooks/responsive-search-policy';
import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import {
  AdminUsersSearchContext,
  type AdminUsersFilterKey,
  type AdminUsersPendingKind,
  type AdminUsersSearchValue,
} from './admin-users-search-context';
import { buildDraftSearchHref, buildSearchQuery, shouldReassert } from './admin-users-search-query';

export { useAdminUsersSearch } from './admin-users-search-context';

export function AdminUsersSearchProvider({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsString = params.toString();
  const currentSearch = params.get('search') || '';
  const [searchValue, setSearchValue] = useState(currentSearch);
  const [, startTransition] = useTransition();
  const requestedParams = useRef<string | null>(null);
  const navigationParams = useRef(paramsString);
  const ownNavigations = useRef(new Set<string>());
  const submittedSearch = useRef<string | null>(null);
  const historyParams = useRef<string | null>(null);
  const handledParams = useRef<string | null>(null);
  const pendingKindRef = useRef<AdminUsersPendingKind | null>(null);
  const draft = useRef(searchValue);
  // Draft that must not reach the url again: a real navigation already
  // superseded it. Cleared as soon as the user edits the field.
  const suppressedDraft = useRef<string | null>(null);
  const supersededExternally = useRef(false);
  const searchTimer = useRef<number | null>(null);
  const routePath = useRef(pathname);
  const committedParams = useRef(paramsString);
  const committedRoute = useRef(routeKey(pathname, paramsString));
  const wasSuspended = useRef(false);
  // Monotonic owner identity, claimed synchronously by every ownership change,
  // so an already queued recovery callback can see it owns nothing any more.
  const owner = useRef(0);
  const [pendingKind, setPendingKind] = useState<AdminUsersPendingKind | null>(null);
  const [ownerEpoch, setOwnerEpoch] = useState(0);
  const [isHistoryPending, setIsHistoryPending] = useState(false);
  const updatePending = useCallback((kind: AdminUsersPendingKind | null) => {
    pendingKindRef.current = kind;
    setPendingKind(kind);
    // Ownership changes on every new request, including a newer one of the same
    // kind, and on every settlement, so queued recovery work is invalidated.
    owner.current += 1;
    setOwnerEpoch(owner.current);
  }, []);
  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current === null) return;
    window.clearTimeout(searchTimer.current);
    searchTimer.current = null;
  }, []);
  const syncDraft = useCallback((value: string) => {
    draft.current = value;
    setSearchValue(value);
  }, []);
  const setDraft = useCallback(
    (value: string) => {
      if (suppressedDraft.current !== value) suppressedDraft.current = null;
      syncDraft(value);
    },
    [syncDraft]
  );
  // Adopts a real external query - explicit history, or the window url a hidden
  // tree resumed onto - as the owner of the draft, of the retained target and of
  // any queued work, then awaits its publication the way history already does.
  const adoptExternalQuery = useCallback(
    (query: string, isResume = false) => {
      const value = new URLSearchParams(query).get('search') || '';
      const isPending = query !== committedParams.current;
      if (isResume) ownNavigations.current.clear();
      if (isPending) ownNavigations.current.add(query);
      else ownNavigations.current.delete(query);
      clearSearchTimer();
      supersededExternally.current = false;
      historyParams.current = isPending ? query : null;
      setIsHistoryPending(isPending);
      requestedParams.current = null;
      navigationParams.current = query;
      submittedSearch.current = value;
      updatePending(null);
      syncDraft(value);
      // A resumed url may not be retyped into the url by its own adopted value.
      suppressedDraft.current = isResume ? value : null;
    },
    [clearSearchTimer, syncDraft, updatePending]
  );

  useEffect(() => {
    routePath.current = pathname;
    committedParams.current = paramsString;
    committedRoute.current = routeKey(pathname, paramsString);
  }, [pathname, paramsString]);

  useEffect(() => {
    if (handledParams.current === paramsString) return;
    handledParams.current = paramsString;
    if (supersededExternally.current && historyParams.current === null) {
      // A real sibling navigation took over: a late echo of our own obsolete
      // request may neither reassert itself nor roll that navigation back.
      if (ownNavigations.current.delete(paramsString)) return;
      supersededExternally.current = false;
      ownNavigations.current.clear();
      requestedParams.current = null;
    }
    if (historyParams.current !== null) {
      if (historyParams.current !== paramsString) return;
      historyParams.current = null;
      ownNavigations.current.delete(paramsString);
      setIsHistoryPending(false);
      navigationParams.current = paramsString;
    } else if (ownNavigations.current.has(paramsString)) {
      ownNavigations.current.delete(paramsString);
      // Older acknowledgements retain the draft and cannot settle a newer request.
      if (requestedParams.current !== paramsString) {
        if (shouldReassert(requestedParams.current, navigationParams.current, paramsString)) {
          const target = navigationParams.current;
          requestedParams.current = target;
          ownNavigations.current.add(target);
          updatePending('search');
          startTransition(() =>
            router.push(target ? `${pathname}?${target}` : pathname, { scroll: false })
          );
        }
        return;
      }
    } else {
      navigationParams.current = paramsString;
      syncDraft(currentSearch);
    }
    requestedParams.current = null;
    submittedSearch.current = null;
    updatePending(null);
  }, [paramsString, currentSearch, updatePending, syncDraft, pathname, router, startTransition]);

  useEffect(() => {
    const restoreHistory = () =>
      adoptExternalQuery(new URLSearchParams(window.location.search).toString());
    window.addEventListener('popstate', restoreHistory);
    return () => window.removeEventListener('popstate', restoreHistory);
  }, [adoptExternalQuery]);

  useEffect(() => {
    if (!pendingKind && !isHistoryPending) return;
    const armedBy = owner.current;
    const timeout = window.setTimeout(() => {
      // Recover controls after failed/cancelled navigation, but only for the
      // owner that armed this callback: a newer owner has its own window.
      if (owner.current !== armedBy) return;
      updatePending(null);
      historyParams.current = null;
      setIsHistoryPending(false);
    }, PENDING_FEEDBACK_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [pendingKind, ownerEpoch, isHistoryPending, updatePending]);

  const withDraftSearch = useCallback(
    (href: string, filter?: AdminUsersFilterKey) =>
      buildDraftSearchHref(href, searchValue, navigationParams.current, filter),
    [searchValue]
  );
  const navigate = useCallback(
    (href: string, kind: AdminUsersPendingKind) => {
      if (historyParams.current !== null) return;
      // A newer search may overtake an older self-issued search; filters still
      // wait for their own acknowledgement.
      if (pendingKindRef.current && !(kind === 'search' && pendingKindRef.current === 'search'))
        return;
      const nextParams = href.split('?')[1] || '';
      if (nextParams === paramsString && navigationParams.current === paramsString) return;
      // Our own navigation supersedes queued search work synchronously.
      clearSearchTimer();
      suppressedDraft.current = null;
      requestedParams.current = nextParams === paramsString ? null : nextParams;
      navigationParams.current = nextParams;
      ownNavigations.current.add(nextParams);
      submittedSearch.current = searchValue;
      // Same-URL cancellation still supersedes the old request, but has no params change to await.
      updatePending(nextParams === paramsString ? null : kind);
      startTransition(() => router.push(href, { scroll: false }));
    },
    [paramsString, searchValue, updatePending, clearSearchTimer, router]
  );
  const submitSearch = useCallback(() => {
    // Duplicate or already awaited explicit submits stay no-ops.
    if (pendingKindRef.current === 'search' && submittedSearch.current === searchValue) return;
    const query = buildSearchQuery(navigationParams.current, searchValue);
    navigate(query ? `${pathname}?${query}` : pathname, 'search');
  }, [navigate, pathname, searchValue]);
  useEffect(() => {
    if (
      isHistoryPending ||
      (pendingKind && pendingKind !== 'search') ||
      searchValue === currentSearch ||
      submittedSearch.current === searchValue ||
      suppressedDraft.current === searchValue
    )
      return;
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = null;
      submitSearch();
    }, SEARCH_COMMIT_DELAY_MS);
    return clearSearchTimer;
  }, [
    searchValue,
    currentSearch,
    paramsString,
    pendingKind,
    isHistoryPending,
    submitSearch,
    clearSearchTimer,
  ]);

  const cancelForSiblingNavigation = useCallback(() => {
    // An actual sibling navigation starts now, before any queued search: drop
    // that work and stop owning feedback this route will never see settled.
    clearSearchTimer();
    suppressedDraft.current = draft.current;
    supersededExternally.current = true;
    requestedParams.current = null;
    historyParams.current = null;
    setIsHistoryPending(false);
    updatePending(null);
  }, [clearSearchTimer, updatePending]);
  useSiblingNavigationCancel(cancelForSiblingNavigation);

  useEffect(() => {
    // Retained under React.Activity: the cleanup runs while hidden, so this
    // body runs again on resume and reconciles with the real window url.
    if (wasSuspended.current) {
      wasSuspended.current = false;
      const query = new URLSearchParams(window.location.search).toString();
      const isSameRoute =
        normalizeRoutePath(window.location.pathname) === normalizeRoutePath(routePath.current);
      // A real same-route window change is external truth; so is an unchanged
      // url whose draft a sibling navigation already superseded before hiding,
      // because that draft never owned the field this route resumes onto.
      const isExternalQuery = routeKey(routePath.current, query) !== committedRoute.current;
      if (isSameRoute && (isExternalQuery || supersededExternally.current))
        adoptExternalQuery(query, true);
    }
    return () => {
      wasSuspended.current = true;
      clearSearchTimer();
    };
  }, [adoptExternalQuery, clearSearchTimer]);

  const hasRetainedFilterTarget = useCallback(
    (filter: AdminUsersFilterKey) =>
      new URLSearchParams(navigationParams.current).get(filter) !== params.get(filter),
    [params]
  );
  const value = useMemo<AdminUsersSearchValue>(
    () => ({
      searchValue,
      setSearchValue: setDraft,
      submitSearch,
      pendingKind,
      isNavigationPending: Boolean(isHistoryPending || pendingKind),
      hasRetainedFilterTarget,
      navigate,
      withDraftSearch,
    }),
    [
      searchValue,
      setDraft,
      submitSearch,
      pendingKind,
      isHistoryPending,
      hasRetainedFilterTarget,
      navigate,
      withDraftSearch,
    ]
  );
  return (
    <AdminUsersSearchContext.Provider value={value}>{children}</AdminUsersSearchContext.Provider>
  );
}
