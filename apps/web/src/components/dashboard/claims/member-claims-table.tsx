'use client';

import { MemberClaimRow } from './member-claim-row';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { fetchClaims } from '@/lib/api/claims';
import { formatNumber } from '@/lib/utils/number';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@interdomestik/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';
import { useEffect, useState, useTransition } from 'react';

const PER_PAGE = 10;
const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;

const CARD =
  'min-w-0 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] [overflow-wrap:anywhere] forced-colors:border-[CanvasText]';
const CONTROL =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-visible:outline';
const PRIMARY_CONTROL = `${CONTROL} bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]`;
const PAGE_LINK = `${CONTROL} border border-foreground/60 aria-disabled:border-[hsl(var(--border-strong))] aria-disabled:cursor-default aria-disabled:text-foreground/70 hover:bg-[hsl(var(--surface-strong))]`;

function isPrimaryNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type MemberClaimsTableProps = Readonly<{
  /** Server-resolved entry matching the intake admission; defaults to the plain intake. */
  newCaseHref?: string;
  /** Replaces the "first case" label when the entry leads to the membership instead. */
  newCaseLabel?: string;
}>;

export function MemberClaimsTable({
  newCaseHref = '/member/claims/new',
  newCaseLabel,
}: MemberClaimsTableProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('claims');
  const tCategory = useTranslations('claims.category');
  const tCommon = useTranslations('common');

  const statusFilter = searchParams.get('status') || undefined;
  const searchQuery = searchParams.get('search') || undefined;
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const currentParamsString = searchParams.toString();
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const isPageNavigationPending = pendingPage !== null || isTransitionPending;

  useEffect(() => {
    setPendingPage(null);
  }, [currentParamsString]);

  useEffect(() => {
    if (pendingPage === null) {
      return undefined;
    }

    const timeout = globalThis.setTimeout(() => setPendingPage(null), PENDING_FEEDBACK_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [pendingPage]);

  const { data, isLoading, isError, isFetched, isFetching, refetch } = useQuery({
    queryKey: ['claims', 'member', { statusFilter, searchQuery, page }],
    queryFn: ({ signal }) =>
      fetchClaims({
        scope: 'member',
        status: statusFilter,
        search: searchQuery,
        page,
        perPage: PER_PAGE,
        signal,
      }),
  });

  const buildPageLink = (targetPage: number) => {
    const query = new URLSearchParams(searchParams.toString());
    if (targetPage > 1) {
      query.set('page', String(targetPage));
    } else {
      query.delete('page');
    }
    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
  };

  const startPageNavigation = (event: MouseEvent<HTMLAnchorElement>, targetPage: number) => {
    const totalPages = data?.totalPages ?? 1;
    const isPageInert =
      isPageNavigationPending || targetPage === page || targetPage < 1 || targetPage > totalPages;

    if ((isPageInert || event.defaultPrevented) && isPrimaryNavigationClick(event)) {
      event.preventDefault();
      return;
    }

    if (!isPrimaryNavigationClick(event)) {
      return;
    }

    const nextUrl = buildPageLink(targetPage);
    const currentUrl = currentParamsString ? `?${currentParamsString}` : '';

    if (nextUrl === currentUrl) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setPendingPage(targetPage);
    startTransition(() => {
      router.push(`${pathname}${nextUrl}`, { scroll: false });
    });
  };

  const formatCategory = (category: string | null | undefined) => {
    if (!category) return '';

    try {
      return tCategory(category as never);
    } catch {
      return category;
    }
  };

  // Refetching an initial failure can put a data-less query back into the loading state.
  // Keep the retry control in place until that query settles.
  if (isLoading && !isFetched) {
    return (
      <div aria-busy="true" className={`${CARD} p-6 text-sm text-foreground/70`} role="status">
        {tCommon('loading')}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={`${CARD} flex flex-col items-start gap-4 p-5 sm:p-6`}>
        <p className="text-sm text-foreground/70" role="alert">
          {tCommon('errors.generic')}
        </p>
        <button
          aria-busy={isFetching || undefined}
          className={`${PRIMARY_CONTROL} enabled:hover:brightness-110 disabled:cursor-wait`}
          disabled={isFetching}
          onClick={() => refetch()}
          type="button"
        >
          {isFetching ? tCommon('processing') : tCommon('tryAgain')}
        </button>
      </div>
    );
  }

  if (data.claims.length === 0) {
    return (
      <div className={`${CARD} space-y-4 p-5 sm:p-6`} data-testid="member-claims-empty">
        <div className="space-y-2" role="status">
          <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
          <p className="max-w-prose text-sm leading-6 text-foreground/70">
            {searchQuery || statusFilter ? t('empty.filtered') : t('empty.description')}
          </p>
        </div>
        {!searchQuery && !statusFilter && (
          <Link className={`${PRIMARY_CONTROL} hover:brightness-110`} href={newCaseHref}>
            {newCaseLabel ?? t('empty.createFirst')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-w-0 max-w-full space-y-4"
      data-testid="member-claims-table-region"
      aria-busy={isPageNavigationPending ? 'true' : 'false'}
    >
      <div className={`${CARD} p-3 md:p-0`}>
        <Table aria-label={t('title')} className="block md:table md:table-fixed" role="table">
          <TableHeader className="sr-only md:not-sr-only md:table-header-group" role="rowgroup">
            <TableRow
              className="border-[hsl(var(--border-strong))] hover:bg-transparent [&_th]:py-3 [&_th]:font-semibold [&_th]:text-foreground"
              role="row"
            >
              <TableHead className="md:w-1/4" role="columnheader">
                {t('table.title')}
              </TableHead>
              <TableHead role="columnheader">{t('table.company')}</TableHead>
              <TableHead role="columnheader">{t('table.category')}</TableHead>
              <TableHead role="columnheader">{t('table.status')}</TableHead>
              <TableHead role="columnheader">{t('table.amount')}</TableHead>
              <TableHead className="text-right" role="columnheader">
                {t('table.created')}
              </TableHead>
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
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 [overflow-wrap:anywhere]">
        <p aria-live="polite" className="text-sm text-foreground/70">
          {t('memberList.resultCount', { count: formatNumber(data.claims.length, locale) ?? '' })}
        </p>
        {data.totalPages > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={PAGE_LINK}
              href={buildPageLink(page - 1)}
              aria-disabled={isPageNavigationPending || page <= 1 ? 'true' : undefined}
              data-testid="member-claims-page-previous"
              onClick={event => startPageNavigation(event, page - 1)}
              prefetch={false}
              tabIndex={isPageNavigationPending || page <= 1 ? -1 : undefined}
            >
              {tCommon('previous')}
            </Link>
            <span className="min-w-0 text-sm text-foreground/70">
              {tCommon('pagination.pageOf', {
                page: formatNumber(page, locale) ?? '',
                total: formatNumber(data.totalPages, locale) ?? '',
              })}
            </span>
            <Link
              className={PAGE_LINK}
              href={buildPageLink(page + 1)}
              aria-disabled={
                isPageNavigationPending || page >= data.totalPages ? 'true' : undefined
              }
              data-testid="member-claims-page-next"
              onClick={event => startPageNavigation(event, page + 1)}
              prefetch={false}
              tabIndex={isPageNavigationPending || page >= data.totalPages ? -1 : undefined}
            >
              {tCommon('next')}
            </Link>
          </div>
        )}
      </div>
      {pendingPage !== null ? (
        <div
          data-testid="member-claims-pagination-pending"
          role="status"
          aria-live="polite"
          className="text-sm text-foreground/70"
        >
          {tCommon('processing')}
        </div>
      ) : null}
    </div>
  );
}
