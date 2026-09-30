'use client';
import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
type PendingKind = 'search' | 'role' | 'assignment';
type SearchContext = {
  searchValue: string;
  setSearchValue: (value: string) => void;
  pendingKind: PendingKind | null;
  isNavigationPending: boolean;
  navigate: (href: string, kind: PendingKind) => void;
  withDraftSearch: (href: string) => string;
};
const Context = createContext<SearchContext | null>(null);
export function useAdminUsersSearch() {
  return useContext(Context);
}
export function AdminUsersSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsString = params.toString();
  const currentSearch = params.get('search') || '';
  const [searchValue, setSearchValue] = useState(currentSearch);
  const [isTransitionPending, startTransition] = useTransition();
  const requestedParams = useRef<string | null>(null);
  const navigationParams = useRef(paramsString);
  const ownNavigations = useRef(new Set<string>());
  const submittedSearch = useRef<string | null>(null);
  const historyParams = useRef<string | null>(null);
  const pendingKindRef = useRef<PendingKind | null>(null);
  const [pendingKind, setPendingKind] = useState<PendingKind | null>(null);
  const [isHistoryPending, setIsHistoryPending] = useState(false);
  const updatePending = useCallback((kind: PendingKind | null) => {
    pendingKindRef.current = kind;
    setPendingKind(kind);
  }, []);

  useEffect(() => {
    if (historyParams.current !== null) {
      if (historyParams.current !== paramsString) return;
      historyParams.current = null;
      setIsHistoryPending(false);
      navigationParams.current = paramsString;
      setSearchValue(currentSearch);
    } else if (ownNavigations.current.has(paramsString)) {
      ownNavigations.current.delete(paramsString);
      // Older acknowledgements retain the draft and cannot settle a newer request.
      if (requestedParams.current !== paramsString) return;
    } else {
      navigationParams.current = paramsString;
      setSearchValue(currentSearch);
    }
    requestedParams.current = null;
    submittedSearch.current = null;
    updatePending(null);
  }, [paramsString, currentSearch, updatePending]);

  useEffect(() => {
    const restoreHistory = () => {
      const target = window.location.search.slice(1);
      const value = new URLSearchParams(target).get('search') || '';
      historyParams.current = target === paramsString ? null : target;
      setIsHistoryPending(target !== paramsString);
      requestedParams.current = null;
      navigationParams.current = target;
      submittedSearch.current = value;
      updatePending(null);
      setSearchValue(value);
    };
    window.addEventListener('popstate', restoreHistory);
    return () => window.removeEventListener('popstate', restoreHistory);
  }, [paramsString, updatePending]);

  useEffect(() => {
    if (!pendingKind && !isHistoryPending) return;
    const timeout = window.setTimeout(() => {
      // Recover controls after failed/cancelled navigation, retaining request identities
      // so a late acknowledgement still cannot overwrite newer typing.
      updatePending(null);
      historyParams.current = null;
      setIsHistoryPending(false);
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [pendingKind, isHistoryPending, updatePending]);

  const withDraftSearch = (href: string) => {
    const [targetPath, query = ''] = href.split('?');
    const nextParams = new URLSearchParams(query);
    nextParams.delete('page');
    if (searchValue) nextParams.set('search', searchValue);
    else nextParams.delete('search');
    return nextParams.size ? `${targetPath}?${nextParams}` : targetPath;
  };
  const navigate = useCallback(
    (href: string, kind: PendingKind) => {
      if (historyParams.current !== null || pendingKindRef.current) return;
      const nextParams = href.split('?')[1] || '';
      if (nextParams === paramsString) return;
      requestedParams.current = nextParams;
      navigationParams.current = nextParams;
      ownNavigations.current.add(nextParams);
      submittedSearch.current = searchValue;
      updatePending(kind);
      startTransition(() => router.push(href, { scroll: false }));
    },
    [paramsString, searchValue, updatePending, router]
  );
  useEffect(() => {
    if (
      isHistoryPending ||
      pendingKind ||
      searchValue === currentSearch ||
      submittedSearch.current === searchValue
    )
      return;
    const timeout = window.setTimeout(() => {
      const nextParams = new URLSearchParams(navigationParams.current);
      nextParams.delete('page');
      if (searchValue) nextParams.set('search', searchValue);
      else nextParams.delete('search');
      const query = nextParams.toString();
      navigate(query ? `${pathname}?${query}` : pathname, 'search');
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchValue, currentSearch, paramsString, pathname, pendingKind, isHistoryPending, navigate]);
  return (
    <Context.Provider
      value={{
        searchValue,
        setSearchValue,
        pendingKind,
        isNavigationPending: Boolean(isHistoryPending || pendingKind || isTransitionPending),
        navigate,
        withDraftSearch,
      }}
    >
      {children}
    </Context.Provider>
  );
}
