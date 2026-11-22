'use client';

import { PENDING_FEEDBACK_TIMEOUT_MS } from '@/hooks/use-responsive-search';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { fetchClaims } from '@/lib/api/claims';
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

type PageNavigation = { from: string; to: string };

function useMemberClaimsPageNavigation(currentParams: string, isPlaceholderData: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingPage, setPendingPage] = useState<PageNavigation | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const isFilterNavigationPending = useMemberClaimsFilterPending();

  const awaitingPageCommit = pendingPage?.from === currentParams;
  const isPagePending =
    awaitingPageCommit ||
    isTransitionPending ||
    (pendingPage?.to === currentParams && isPlaceholderData);
  const isPending = isPagePending || isFilterNavigationPending || isPlaceholderData;

  useEffect(() => {
    if (awaitingPageCommit) {
      const timeout = globalThis.setTimeout(
        () => setPendingPage(null),
        PENDING_FEEDBACK_TIMEOUT_MS
      );
      return () => globalThis.clearTimeout(timeout);
    }
    if (pendingPage && (pendingPage.to !== currentParams || !isPlaceholderData)) {
      setPendingPage(null);
    }
    return undefined;
  }, [awaitingPageCommit, currentParams, isPlaceholderData, pendingPage]);

  function pageParams(targetPage: number) {
    const query = new URLSearchParams(currentParams);
    if (targetPage > 1) query.set('page', String(targetPage));
    else query.delete('page');
    return query.toString();
  }

  function pageHref(params: string) {
    return params ? `${pathname}?${params}` : pathname;
  }

  function getPageHref(targetPage: number) {
    return pageHref(pageParams(targetPage));
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
    setPendingPage({ from: currentParams, to: params });
    startTransition(() => router.push(pageHref(params), { scroll: false }));
  }

  return { getPageHref, isPagePending, isPending, startPageNavigation };
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

function useMemberClaimsListState(locale: string, t: ReturnType<typeof useTranslations<'claims'>>) {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || undefined;
  const searchQuery = searchParams.get('search') || undefined;
  const requestedPage = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const currentParams = searchParams.toString();
  const request = { statusFilter, searchQuery, page };

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
  const navigation = useMemberClaimsPageNavigation(currentParams, isPlaceholderData);
  const { isRetrying, retry } = useMemberClaimsRetry(JSON.stringify(request), refetch);

  const [resultStatus, setResultStatus] = useState('');
  const displayedPage = data?.page ?? page;
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const pageLabel = formatNumber(displayedPage, locale) ?? '';
  const totalPagesLabel = formatNumber(totalPages, locale) ?? '';
  let pageEmptyMessage: string | undefined;
  if (page > 1 && data?.claims.length === 0) {
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
    displayedPage,
    hasFilters: Boolean(searchQuery || statusFilter),
    isPlaceholderData,
    isRetrying,
    page,
    pageEmptyMessage,
    pageLabel,
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
    displayedPage,
    getPageHref,
    hasFilters,
    isPagePending,
    isPending,
    isPlaceholderData,
    isRetrying,
    page,
    pageEmptyMessage,
    pageLabel,
    resultStatus,
    retry,
    showsError,
    startPageNavigation,
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
    if (isPending || isRetrying || !removedFocusedControl.current) return;
    if (!removedFocusedControl.current.isConnected && document.activeElement === document.body) {
      regionRef.current?.focus();
    }
    removedFocusedControl.current = null;
  });

  // A placeholder can outlive a failed key in the query observer. Only a
  // successful last completion can supply rows for the next request.
  const showsUpdating = isPlaceholderData && resultStatus !== '' && Boolean(data?.claims.length);
  const showsLoading = !showsError && (!data || (isPlaceholderData && !showsUpdating));
  const showsEmpty = !showsError && !isPlaceholderData && data?.claims.length === 0;
  const hasRows = !showsError && !showsLoading && Boolean(data?.claims.length);

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
        aria-disabled={isPending || undefined}
        className={PAGE_LINK}
        data-testid={testId}
        href={getPageHref(target)}
        onAuxClick={event => {
          if (isPending) event.preventDefault();
        }}
        onClick={event => startPageNavigation(event, target)}
        prefetch={false}
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

        {showsEmpty && (
          <div className={`${CARD} space-y-4 p-5 sm:p-6`} data-testid="member-claims-empty">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
              <output className="block max-w-prose text-sm leading-6 text-foreground/70">
                {pageEmptyMessage ?? t(hasFilters ? 'empty.filtered' : 'empty.description')}
              </output>
            </div>
            {page > 1 && (
              <Link
                aria-disabled={isPending || undefined}
                className={PAGE_LINK}
                href={getPageHref(1)}
                onClick={event => startPageNavigation(event, 1)}
                ref={watchControl}
              >
                {tCommon('previous')}
              </Link>
            )}
            {page === 1 && !hasFilters && (
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
            {pageControl('previous', displayedPage - 1, displayedPage <= 1)}
            <span className="min-w-0 text-sm text-foreground/70">
              {tCommon('pagination.pageOf', { page: pageLabel, total: totalPagesLabel })}
            </span>
            {pageControl('next', displayedPage + 1, displayedPage >= totalPages)}
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
      <p aria-live="polite" className="text-sm text-foreground/70">
        {resultStatus}
      </p>
    </div>
  );
}
