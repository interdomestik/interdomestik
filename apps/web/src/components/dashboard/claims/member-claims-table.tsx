'use client';

import { Link } from '@/i18n/routing';
import { formatNumber } from '@/lib/utils/number';
import { TableBody, TableHead, TableHeader, TableRow } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useId, useLayoutEffect, useRef } from 'react';
import { MEMBER_CLAIM_DETAIL_COLUMNS, MemberClaimRow } from './member-claim-row';
import { useMemberClaimsListState } from './member-claims-table-state';

const CARD =
  'min-w-0 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] [overflow-wrap:anywhere] forced-colors:border-[CanvasText]';
const CONTROL =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-9 sm:min-w-9 forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-visible:outline';
const PRIMARY_CONTROL = `${CONTROL} bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]`;
const PAGE_LINK = `${CONTROL} border border-foreground/60 aria-disabled:cursor-default aria-disabled:text-foreground/70 hover:bg-[hsl(var(--surface-strong))]`;

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

  // A retained empty-page card already carries the updating copy; show it only once.
  const showsUpdating = !keepsEmptyPage && Boolean(retainedResult?.data.claims.length);
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
                  className="block border-[hsl(var(--border-strong))] hover:bg-transparent md:table-row [&_th]:block [&_th]:py-3 [&_th]:font-semibold [&_th]:text-foreground md:[&_th]:table-cell"
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
