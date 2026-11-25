import { Link } from '@/i18n/routing';
import type { ClaimsListItem } from '@/lib/api/claims';
import { formatClaimAmount } from '@/lib/utils/currency';
import { formatPilotDate } from '@/lib/utils/date';
import { TableCell, TableRow } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ClaimStatusBadge } from './claim-status-badge';

export const MEMBER_CLAIM_DETAIL_COLUMNS = [
  'status',
  'company',
  'category',
  'amount',
  'created',
] as const;

type DetailColumn = (typeof MEMBER_CLAIM_DETAIL_COLUMNS)[number];

function ClaimDetailCell({
  children,
  column,
  headerIdPrefix,
  label,
}: Readonly<{
  children: ReactNode;
  column: DetailColumn;
  headerIdPrefix?: string;
  label: string;
}>) {
  return (
    <TableCell
      className={`flex min-w-0 justify-between gap-3 p-0 text-right md:table-cell md:p-2 ${
        column === 'created' ? 'md:text-right' : 'md:text-left'
      }`}
      headers={headerIdPrefix && `${headerIdPrefix}-${column}`}
      role="cell"
    >
      <span
        aria-hidden="true"
        className="max-w-[45%] shrink-0 text-left text-foreground/70 md:hidden"
      >
        {label}
      </span>
      <div className="min-w-0 [&>*]:max-w-full">{children}</div>
    </TableCell>
  );
}

/** One set of links and cells: member-home card styling on phones, table rows on desktop. */
export function MemberClaimRow({
  claim,
  locale,
  formatCategory,
  headerIdPrefix,
}: Readonly<{
  claim: ClaimsListItem;
  locale: string;
  formatCategory: (category: string | null | undefined) => string;
  headerIdPrefix?: string;
}>): React.JSX.Element {
  const t = useTranslations('claims');
  const amount = formatClaimAmount(claim.claimAmount, claim.currency, locale);
  const created = formatPilotDate(claim.createdAt, locale, '');
  const unavailable = (
    <>
      <span aria-hidden="true">-</span>
      <span className="sr-only">{t('table.unavailable')}</span>
    </>
  );
  const details: Record<DetailColumn, ReactNode> = {
    status: <ClaimStatusBadge status={claim.status} />,
    company: claim.companyName?.trim() || t('table.unavailable'),
    category: formatCategory(claim.category) || t('table.unavailable'),
    amount: amount ? <span className="font-medium">{amount}</span> : unavailable,
    created: <span suppressHydrationWarning>{created || unavailable}</span>,
  };

  return (
    <TableRow
      className="grid min-w-0 gap-3 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-4 [overflow-wrap:anywhere] hover:bg-[hsl(var(--surface))] md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0 md:hover:bg-muted/50 forced-colors:border-[CanvasText]"
      role="row"
    >
      <TableCell
        className="block min-w-0 p-0 md:table-cell md:p-2"
        headers={headerIdPrefix && `${headerIdPrefix}-title`}
        role="cell"
      >
        <Link
          href={`/member/claims/${claim.id}`}
          className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-sm font-semibold underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-6 md:min-w-6 md:underline forced-colors:underline forced-colors:focus-visible:outline"
        >
          <span className="min-w-0">{claim.title}</span>
        </Link>
      </TableCell>
      {MEMBER_CLAIM_DETAIL_COLUMNS.map(column => (
        <ClaimDetailCell
          key={column}
          column={column}
          headerIdPrefix={headerIdPrefix}
          label={t(`table.${column}`)}
        >
          {details[column]}
        </ClaimDetailCell>
      ))}
    </TableRow>
  );
}
