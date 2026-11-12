import { Link } from '@/i18n/routing';
import type { ClaimsListItem } from '@/lib/api/claims';
import { formatClaimAmount } from '@/lib/utils/currency';
import { formatPilotDate } from '@/lib/utils/date';
import { TableCell, TableRow } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { ClaimStatusBadge } from './claim-status-badge';

const DETAIL_CELL =
  'flex min-w-0 justify-between gap-3 p-0 text-right before:shrink-0 before:text-left before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:p-2 md:text-left md:before:hidden';

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

  return (
    <TableRow className="grid min-w-0 gap-3 rounded-[1.25rem] border border-emerald-950/10 bg-[#f8f5ee] p-4 hover:bg-muted/50 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0">
      <TableCell className="block min-w-0 p-0 font-semibold md:table-cell md:p-2 md:font-medium">
        <Link
          href={`/member/claims/${claim.id}`}
          className="block break-words hover:underline underline-offset-4 md:max-w-[240px] md:truncate"
          title={claim.title}
        >
          {claim.title}
        </Link>
      </TableCell>
      <TableCell
        className={DETAIL_CELL}
        data-label={t('table.company')}
        title={claim.companyName || ''}
      >
        <span className="min-w-0 break-words md:block md:max-w-[200px] md:truncate">
          {claim.companyName}
        </span>
      </TableCell>
      <TableCell
        className={`${DETAIL_CELL} capitalize text-sm text-muted-foreground`}
        data-label={t('table.category')}
      >
        <span className="min-w-0 break-words">{formatCategory(claim.category)}</span>
      </TableCell>
      <TableCell className={DETAIL_CELL} data-label={t('table.status')}>
        <ClaimStatusBadge status={claim.status} />
      </TableCell>
      <TableCell className={DETAIL_CELL} data-label={t('table.amount')}>
        <span className={amount ? 'font-medium' : 'text-muted-foreground'}>{amount || '-'}</span>
      </TableCell>
      <TableCell
        className={`${DETAIL_CELL} text-sm md:text-right`}
        data-label={t('table.created')}
        suppressHydrationWarning
      >
        {formatPilotDate(claim.createdAt, locale, '-')}
      </TableCell>
    </TableRow>
  );
}
