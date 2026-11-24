'use client';

import { PENDING_FEEDBACK_TIMEOUT_MS } from '@/hooks/use-responsive-search';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { fetchClaims, type ClaimsListResponse } from '@/lib/api/claims';
import { formatNumber } from '@/lib/utils/number';
import { TableBody, TableHead, TableHeader, TableRow } from '@interdomestik/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useMemberClaimsFilterPending } from './claims-filters';
import { MEMBER_CLAIM_DETAIL_COLUMNS, MemberClaimRow } from './member-claim-row';

const PER_PAGE = 10;
const CARD =
  'min-w-0 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] [overflow-wrap:anywhere] forced-colors:border-[CanvasText]';
const CONTROL =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-9 sm:min-w-9 forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-visible:outline';
const PRIMARY_CONTROL = `${CONTROL} bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]`;
const PAGE_LINK = `${CONTROL} border border-foreground/60 aria-disabled:cursor-default aria-disabled:text-foreground/70 hover:bg-[hsl(var(--surface-strong))]`;

function isPrimaryNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type MemberClaimsTableProps = Readonly<{
  /** Server-resolved entry matching the intake admission; defaults to the plain intake. */
  newCaseHref?: string;
  /** Replaces the "first case" label when the entry leads to the membership instead. */
  newCaseLabel?: string;
}>;

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

  if (isPlaceholderData && lastSuccess?.data === data) {
    return lastSuccess;
  }
  return null;
}

function useMemberClaimsListState(locale: string, t: ReturnType<typeof useTranslations<'claims'>>) {
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

export function MemberClaimsTable({
  newCaseHref = '/member/claims/new',
  newCaseLabel,
}: MemberClaimsTableProps = {}) {
  const locale = useLocale();
  const t = useTranslations('claims');
  const tCategory = useTranslations('claims.category');
  const tCommon = useTranslations('common');
  const headerId = useId();
  const {
    data,
    effectivePage,
    getPageLinkProps,
    hasFilters,
    isPagePending,
    isPending,
    isPlaceholderData,
    isRetrying,
    keepsEmptyPage,
    pageEmptyMessage,
    pageLabel,
    retainedResult,
    resultStatus,
    retry,
    showsError,
    totalPages,
    totalPagesLabel,
  } = useMemberClaimsListState(locale, t);

  const regionRef = useRef<HTMLElement>(null);
  const removedFocusedControl = useRef<HTMLElement>(null);
  const watchControl = useCallback((control: HTMLElement | null) => {
    if (!control) return;
    return () => {
      if (control === document.activeElement) removedFocusedControl.current = control;
    };
  }, []);
  useLayoutEffect(() => {
    if (!removedFocusedControl.current) {
      return;
    }
    if (!removedFocusedControl.current.isConnected && document.activeElement === document.body) {
      regionRef.current?.focus();
    }
    removedFocusedControl.current = null;
  });

  const showsUpdating = Boolean(retainedResult?.data.claims.length);
  const showsLoading =
    !showsError && !keepsEmptyPage && (!data || (isPlaceholderData && !showsUpdating));
  const showsSettledEmpty = !showsError && !isPlaceholderData && data?.claims.length === 0;
  const hasRows = !showsError && !showsLoading && Boolean(data?.claims.length);
  // Keep the retained rows' links mounted at their original pagination endpoints.
  const controlPage = data?.page ?? effectivePage;
  // The indicator describes the rows on screen, which stay the previous page while updating.
  const controlPageLabel = isPlaceholderData
    ? (formatNumber(controlPage, locale) ?? '')
    : pageLabel;
  let emptyTestId: string | undefined;
  if (showsSettledEmpty) {
    emptyTestId = 'member-claims-empty';
  }
  let announcementClassName = 'text-sm text-foreground/70';
  if (keepsEmptyPage) {
    // Keep the completion announcement mounted without showing the old empty-page copy.
    announcementClassName = 'sr-only';
  }

  function pageControl(direction: 'previous' | 'next', target: number, isEnd: boolean) {
    const testId = `member-claims-page-${direction}`;
    if (isEnd) {
      return (
        <span aria-disabled="true" className={PAGE_LINK} data-testid={testId}>
          {tCommon(direction)}
        </span>
      );
    }
    return (
      <Link
        {...getPageLinkProps(target)}
        className={PAGE_LINK}
        data-testid={testId}
        ref={watchControl}
      >
        {tCommon(direction)}
      </Link>
    );
  }

  const formatCategory = (category: string | null | undefined) =>
    category && tCategory.has(category) ? tCategory(category) : '';

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <section
        aria-busy={Boolean(isPending || showsLoading)}
        aria-label={t('title')}
        className="min-w-0 space-y-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:focus-visible:outline"
        data-testid={hasRows && !isPlaceholderData ? 'member-claims-table-region' : undefined}
        ref={regionRef}
        tabIndex={-1}
      >
        {showsLoading && (
          <div className={`${CARD} space-y-3 p-6 text-sm text-foreground/70`}>
            <output className="block">{tCommon('loading')}</output>
            <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
              <div className="h-6 rounded-lg bg-[hsl(var(--surface-strong))]" />
              <div className="h-6 rounded-lg bg-[hsl(var(--surface-strong))]" />
              <div className="h-6 rounded-lg bg-[hsl(var(--surface-strong))]" />
            </div>
          </div>
        )}

        {showsError && (
          <div className={`${CARD} flex flex-col items-start gap-4 p-5 sm:p-6`}>
            <p className="text-sm text-foreground/70" role="alert">
              {tCommon('errors.generic')}
            </p>
            <button
              aria-busy={isRetrying || undefined}
              aria-disabled={isRetrying || undefined}
              className={`${PRIMARY_CONTROL} hover:underline aria-disabled:cursor-wait`}
              onClick={retry}
              ref={watchControl}
              type="button"
            >
              {isRetrying ? tCommon('processing') : tCommon('tryAgain')}
            </button>
          </div>
        )}

        {(showsSettledEmpty || keepsEmptyPage) && (
          <div className={`${CARD} space-y-4 p-5 sm:p-6`} data-testid={emptyTestId}>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{pageEmptyMessage ?? t('empty.title')}</h3>
              {!pageEmptyMessage && (
                <output className="block max-w-prose text-sm leading-6 text-foreground/70">
                  {t(hasFilters ? 'empty.filtered' : 'empty.description')}
                </output>
              )}
            </div>
            {pageEmptyMessage && (
              <Link {...getPageLinkProps(1)} className={PAGE_LINK} ref={watchControl}>
                {tCommon('previous')}
              </Link>
            )}
            {showsSettledEmpty && effectivePage === 1 && !hasFilters && (
              <Link className={`${PRIMARY_CONTROL} hover:underline`} href={newCaseHref}>
                {newCaseLabel ?? t('empty.createFirst')}
              </Link>
            )}
          </div>
        )}

        {showsUpdating && (
          <output className="block text-sm text-foreground/70">{t('memberList.updating')}</output>
        )}

        {hasRows && data && (
          <div className={`${CARD} p-3 md:p-0`}>
            <table
              aria-label={t('title')}
              className="block w-full text-sm md:table md:table-fixed"
              role="table"
            >
              <TableHeader className="sr-only md:not-sr-only md:table-header-group" role="rowgroup">
                <TableRow
                  className="border-[hsl(var(--border-strong))] hover:bg-transparent [&_th]:py-3 [&_th]:font-semibold [&_th]:text-foreground"
                  role="row"
                >
                  <TableHead id={`${headerId}-title`} className="md:w-1/4" role="columnheader">
                    {t('detail.continuity.caseLabel')}
                  </TableHead>
                  {MEMBER_CLAIM_DETAIL_COLUMNS.map(column => (
                    <TableHead
                      key={column}
                      id={`${headerId}-${column}`}
                      className={column === 'created' ? 'text-right' : undefined}
                      role="columnheader"
                    >
                      {t(`table.${column}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody
                className="block space-y-3 [&_tr:last-child]:border md:table-row-group md:space-y-0 md:[&_tr:last-child]:border-0"
                role="rowgroup"
              >
                {data.claims.map(claim => (
                  <MemberClaimRow
                    key={claim.id}
                    claim={claim}
                    locale={locale}
                    formatCategory={formatCategory}
                    headerIdPrefix={headerId}
                  />
                ))}
              </TableBody>
            </table>
          </div>
        )}

        {hasRows && totalPages > 1 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
            {pageControl('previous', controlPage - 1, controlPage <= 1)}
            <span className="min-w-0 text-sm text-foreground/70">
              {tCommon('pagination.pageOf', { page: controlPageLabel, total: totalPagesLabel })}
            </span>
            {pageControl('next', controlPage + 1, controlPage >= totalPages)}
          </div>
        )}

        {isPagePending && (
          <output
            data-testid="member-claims-pagination-pending"
            className="block text-sm text-foreground/70"
          >
            {tCommon('processing')}
          </output>
        )}
      </section>
      <p aria-live="polite" className={announcementClassName}>
        {resultStatus}
      </p>
    </div>
  );
}
