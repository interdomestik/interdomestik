import { Link } from '@/i18n/routing';
import type { ClaimsListItem } from '@/lib/api/claims';
import { formatClaimAmount } from '@/lib/utils/currency';
import { formatPilotDate } from '@/lib/utils/date';
import { TableCell, TableRow } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { ClaimStatusBadge } from './claim-status-badge';

const DETAIL_CELL =
  'flex min-w-0 justify-between gap-3 p-0 text-right before:max-w-[45%] before:shrink-0 before:text-left before:text-foreground/70 before:content-[attr(data-label)] md:table-cell md:p-2 md:text-left md:before:hidden';
const MISSING_VALUE_MARK = '-';

/** One set of links and cells: member-home card styling on phones, table rows on desktop. */
export function MemberClaimRow({
  claim,
  locale,
  formatCategory,
}: Readonly<{
  claim: ClaimsListItem;
  locale: string;
  formatCategory: (category: string | null | undefined) => string;
}>): React.JSX.Element {
  const t = useTranslations('claims');
  const amount = formatClaimAmount(claim.claimAmount, claim.currency, locale);
  const created = formatPilotDate(claim.createdAt, locale, '');
  const unavailable = (
    <>
      <span aria-hidden="true">{MISSING_VALUE_MARK}</span>
      <span className="sr-only">{t('table.unavailable')}</span>
    </>
  );

  return (
    <TableRow
      className="grid min-w-0 gap-3 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-4 [overflow-wrap:anywhere] hover:bg-[hsl(var(--surface))] md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0 md:hover:bg-[hsl(var(--surface-strong))] forced-colors:border-[CanvasText]"
      role="row"
    >
      <TableCell
        className="block min-w-0 p-0 font-semibold md:table-cell md:p-2 md:font-medium"
        role="cell"
      >
        <Link
          href={`/member/claims/${claim.id}`}
          className="flex min-h-11 min-w-11 items-center rounded-xl bg-[hsl(var(--primary))] px-3 py-2 break-words text-[hsl(var(--primary-foreground))] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:block md:min-h-0 md:min-w-0 md:truncate md:rounded-sm md:bg-transparent md:p-0 md:text-foreground md:underline forced-colors:underline forced-colors:focus-visible:outline"
          title={claim.title}
        >
          <span className="min-w-0 [overflow-wrap:anywhere] md:block md:truncate">
            {claim.title}
          </span>
        </Link>
      </TableCell>
      <TableCell
        className={DETAIL_CELL}
        data-label={t('table.company')}
        title={claim.companyName || ''}
        role="cell"
      >
        <span className="min-w-0 break-words md:block md:truncate">{claim.companyName}</span>
      </TableCell>
      <TableCell
        className={`${DETAIL_CELL} capitalize text-sm text-foreground/70`}
        data-label={t('table.category')}
        role="cell"
      >
        <span className="min-w-0 break-words">{formatCategory(claim.category) || unavailable}</span>
      </TableCell>
      <TableCell
        className={`${DETAIL_CELL} [&>*]:min-w-0 [&>*]:max-w-full`}
        data-label={t('table.status')}
        role="cell"
      >
        <ClaimStatusBadge status={claim.status} />
      </TableCell>
      <TableCell className={DETAIL_CELL} data-label={t('table.amount')} role="cell">
        <span className={amount ? 'font-medium' : 'text-foreground/70'}>
          {amount ?? unavailable}
        </span>
      </TableCell>
      <TableCell
        className={`${DETAIL_CELL} text-sm md:text-right`}
        data-label={t('table.created')}
        role="cell"
        suppressHydrationWarning
      >
        <span className="min-w-0">{created || unavailable}</span>
      </TableCell>
    </TableRow>
  );
}
