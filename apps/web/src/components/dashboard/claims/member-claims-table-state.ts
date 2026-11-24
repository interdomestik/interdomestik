import { PENDING_FEEDBACK_TIMEOUT_MS } from '@/hooks/use-responsive-search';
import { usePathname, useRouter } from '@/i18n/routing';
import { fetchClaims, type ClaimsListResponse } from '@/lib/api/claims';
import { formatNumber } from '@/lib/utils/number';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useMemberClaimsFilterPending } from './claims-filters';

const PER_PAGE = 10;

function isPrimaryNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type PageNavigation = { from: string; to: string; committed: boolean; fromEmptyPage: boolean };

function useMemberClaimsPageNavigation(
  currentParams: string,
  isPlaceholderData: boolean,
  isEmptyLaterPage: boolean
) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingPage, setPendingPage] = useState<PageNavigation | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const isFilterNavigationPending = useMemberClaimsFilterPending();

  const awaitingPageCommit = pendingPage?.committed === false && pendingPage.from === currentParams;
  const awaitingPageData = pendingPage?.to === currentParams && isPlaceholderData;
  const keepsEmptyPage = awaitingPageData && pendingPage.fromEmptyPage;
  const isPagePending = awaitingPageCommit || isTransitionPending || awaitingPageData;
  const isPending = isPagePending || isFilterNavigationPending || isPlaceholderData;

  useEffect(() => {
    if (awaitingPageCommit) {
      const timeout = globalThis.setTimeout(
        () => setPendingPage(null),
        PENDING_FEEDBACK_TIMEOUT_MS
      );
      return () => globalThis.clearTimeout(timeout);
    }
    if (!pendingPage) {
      return undefined;
    }
    if (!awaitingPageData) {
      setPendingPage(null);
    } else if (!pendingPage.committed) {
      setPendingPage({ ...pendingPage, committed: true });
    }
    return undefined;
  }, [awaitingPageCommit, awaitingPageData, pendingPage]);

  function pageParams(targetPage: number) {
    const query = new URLSearchParams(currentParams);
    if (targetPage > 1) query.set('page', String(targetPage));
    else query.delete('page');
    return query.toString();
  }

  function pageHref(params: string) {
    return params ? `${pathname}?${params}` : pathname;
  }

  function startPageNavigation(event: MouseEvent<HTMLAnchorElement>, targetPage: number) {
    if (isPending) {
      event.preventDefault();
      return;
    }
    if (event.defaultPrevented || !isPrimaryNavigationClick(event)) return;

    const params = pageParams(targetPage);
    event.preventDefault();
    if (params === currentParams) return;
    setPendingPage({
      from: currentParams,
      to: params,
      committed: false,
      fromEmptyPage: isEmptyLaterPage,
    });
    startTransition(() => router.push(pageHref(params), { scroll: false }));
  }

  function getPageLinkProps(targetPage: number) {
    return {
      'aria-disabled': isPending || undefined,
      href: pageHref(pageParams(targetPage)),
      onAuxClick(event: MouseEvent<HTMLAnchorElement>) {
        if (isPending) {
          event.preventDefault();
        }
      },
      onClick(event: MouseEvent<HTMLAnchorElement>) {
        startPageNavigation(event, targetPage);
      },
      prefetch: false,
    };
  }

  return { getPageLinkProps, isPagePending, isPending, keepsEmptyPage };
}

function useMemberClaimsRetry(requestKey: string, refetch: () => Promise<unknown>) {
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const retryInFlight = useRef(false);
  const isRetrying = retryKey === requestKey;

  async function retry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetryKey(requestKey);
    try {
      await refetch();
    } finally {
      retryInFlight.current = false;
      setRetryKey(null);
    }
  }

  return { isRetrying, retry };
}

function useMemberClaimsRetainedResult(
  requestKey: string,
  data: ClaimsListResponse | undefined,
  isPlaceholderData: boolean,
  isError: boolean
) {
  const [lastSuccess, setLastSuccess] = useState<{ key: string; data: ClaimsListResponse } | null>(
    null
  );

  // The query observer can still offer old placeholder data after a failed key.
  if (isError) {
    if (lastSuccess) {
      setLastSuccess(null);
    }
    return null;
  }
  if (
    !isPlaceholderData &&
    data &&
    (lastSuccess?.key !== requestKey || lastSuccess.data !== data)
  ) {
    setLastSuccess({ key: requestKey, data });
  }

  // Retain whatever placeholder the query offers once a request has succeeded and none has
  // failed since. Comparing object identity would drop rows that a background refresh
  // replaced in the cache just before the URL committed.
  if (isPlaceholderData && lastSuccess && data) {
    return { key: lastSuccess.key, data };
  }
  return null;
}

export function useMemberClaimsListState(
  locale: string,
  t: ReturnType<typeof useTranslations<'claims'>>
) {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || undefined;
  const searchQuery = searchParams.get('search') || undefined;
  const requestedPage = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const currentParams = searchParams.toString();
  const request = { statusFilter, searchQuery, page };
  const requestKey = JSON.stringify(request);

  const { data, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ['claims', 'member', request],
    queryFn: ({ signal }) =>
      fetchClaims({
        scope: 'member',
        status: statusFilter,
        search: searchQuery,
        page,
        perPage: PER_PAGE,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
  let effectivePage = page;
  if (!isPlaceholderData) {
    effectivePage = data?.page ?? page;
  }
  const isEmptyLaterPage = !isPlaceholderData && effectivePage > 1 && data?.claims.length === 0;
  const navigation = useMemberClaimsPageNavigation(
    currentParams,
    isPlaceholderData,
    isEmptyLaterPage
  );
  const { isRetrying, retry } = useMemberClaimsRetry(requestKey, refetch);
  const retainedResult = useMemberClaimsRetainedResult(
    requestKey,
    data,
    isPlaceholderData,
    isError
  );

  const [resultStatus, setResultStatus] = useState('');
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const pageLabel = formatNumber(effectivePage, locale) ?? '';
  const totalPagesLabel = formatNumber(totalPages, locale) ?? '';
  let pageEmptyMessage: string | undefined;
  if (navigation.keepsEmptyPage) {
    pageEmptyMessage = t('memberList.updating');
  } else if (isEmptyLaterPage) {
    pageEmptyMessage = t('memberList.pageEmpty');
  }

  // Keep the last completion message through navigation and retries.
  if (!navigation.isPending && !isRetrying) {
    const message =
      !isError && data
        ? (pageEmptyMessage ??
          t('memberList.resultStatus', {
            page: pageLabel,
            pages: totalPagesLabel,
            count: data.claims.length,
          }))
        : '';
    if (message !== resultStatus) setResultStatus(message);
  }

  return {
    ...navigation,
    data,
    effectivePage,
    hasFilters: Boolean(searchQuery || statusFilter),
    isPlaceholderData,
    isRetrying,
    pageEmptyMessage,
    pageLabel,
    retainedResult,
    resultStatus,
    retry,
    showsError: isError || isRetrying,
    totalPages,
    totalPagesLabel,
  };
}
