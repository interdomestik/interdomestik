'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { Input } from '@interdomestik/ui';
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

const SEARCH_DEBOUNCE_MS = 200;
const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;

function buildAgentClientsSearchUrl(currentParams: URLSearchParams, search: string): string {
  const params = new URLSearchParams(currentParams.toString());

  if (search) {
    params.set('search', search);
  } else {
    params.delete('search');
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function AgentUsersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const t = useTranslations('agent-members.members.filters');
  const [isPending, startTransition] = useTransition();
  const currentSearch = searchParams.get('search') || '';
  const currentParamsString = searchParams.toString();
  const [searchTerm, setSearchTerm] = useState(currentSearch);
  const [isSearchNavigationPending, setIsSearchNavigationPending] = useState(false);
  const isSearchNavigationPendingRef = useRef(false);
  const isNavigationPending = isSearchNavigationPending || isPending;

  const updateSearchNavigationPending = useCallback((nextPending: boolean) => {
    isSearchNavigationPendingRef.current = nextPending;
    setIsSearchNavigationPending(nextPending);
  }, []);

  useEffect(() => {
    setSearchTerm(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    updateSearchNavigationPending(false);
  }, [currentParamsString, updateSearchNavigationPending]);

  useEffect(() => {
    if (!isSearchNavigationPending) {
      return undefined;
    }

    const timeout = globalThis.setTimeout(
      () => updateSearchNavigationPending(false),
      PENDING_FEEDBACK_TIMEOUT_MS
    );
    return () => globalThis.clearTimeout(timeout);
  }, [isSearchNavigationPending, updateSearchNavigationPending]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (isSearchNavigationPendingRef.current) {
        return;
      }

      const nextUrl = buildAgentClientsSearchUrl(searchParams, searchTerm);
      const currentUrl = currentParamsString ? `?${currentParamsString}` : '';

      if (nextUrl === currentUrl) {
        return;
      }

      updateSearchNavigationPending(true);

      startTransition(() => {
        router.push(`${pathname}${nextUrl}`, { scroll: false });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(delayDebounceFn);
  }, [
    currentParamsString,
    pathname,
    router,
    searchParams,
    searchTerm,
    startTransition,
    updateSearchNavigationPending,
  ]);

  return (
    <div
      className="space-y-2"
      data-testid="agent-clients-search-region"
      aria-busy={isNavigationPending ? 'true' : 'false'}
    >
      <div className="relative">
        {isNavigationPending ? (
          <Loader2 className="absolute left-3 top-3 h-4 w-4 text-primary animate-spin" />
        ) : (
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          placeholder={t('search_placeholder') || `${tCommon('search')}...`}
          aria-label={t('search_label') || tCommon('search') || 'Search users'}
          className="pl-9 h-11 border-2 focus-visible:ring-primary shadow-sm"
          data-testid="agent-clients-search-input"
          disabled={isNavigationPending}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          autoFocus
        />
      </div>

      {isSearchNavigationPending ? (
        <div
          data-testid="agent-clients-search-pending"
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-muted-foreground"
        >
          {tCommon('processing')}
        </div>
      ) : null}
    </div>
  );
}
