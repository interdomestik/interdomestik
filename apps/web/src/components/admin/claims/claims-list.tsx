import { Link } from '@/i18n/routing';
import { ClaimsListV2Dto } from '@/server/domains/claims/types';
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { ClaimsListRow } from './claims-list-row';

export interface ClaimsListProps {
  data: ClaimsListV2Dto; // Fully typed DTO
}

const STATUS_ORDER = [
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
  'draft',
] as const;

export function ClaimsList({ data }: ClaimsListProps) {
  const tTable = useTranslations('admin.claims_page.table');
  const tCommon = useTranslations('common');

  const { rows, pagination } = data;
  const { page } = pagination;

  const buildPageLink = (newPage: number) => `?page=${newPage}`;

  // Grouping Logic
  // We keep the grouping logic here as it defines the *structure* of the list
  const groups = STATUS_ORDER.map(status => ({
    status,
    rows: rows.filter(row => row.status === status),
  }));

  // Handle "Other" statuses not in the ordered list
  const statusSet = new Set(STATUS_ORDER);
  const otherRows = rows.filter(row => !statusSet.has(row.status as any));
  if (otherRows.length > 0) {
    groups.push({
      status: 'other' as any,
      rows: otherRows,
    });
  }

  const groupedRows = groups.flatMap(group => {
    if (group.rows.length === 0) return [];

    const groupLabel = tTable(`groups.${group.status}`);
    const headerRow = (
      <TableRow key={`group-${group.status}`} className="bg-white/5 border-white/5">
        <TableCell
          colSpan={2}
          className="pl-6 py-3 text-xs uppercase tracking-wide text-muted-foreground"
        >
          {tTable('group_header', { label: groupLabel, count: group.rows.length })}
        </TableCell>
      </TableRow>
    );

    const claimRows = group.rows.map(row => (
      <ClaimsListRow key={row.id} row={row} showEmphasis={true} />
    ));

    return [headerRow, ...claimRows];
  });

  return (
    <Card className="p-0 overflow-hidden border-white/5 bg-background/40 backdrop-blur-md">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="hover:bg-transparent border-white/5">
              <TableHead className="text-muted-foreground font-medium pl-6">
                {tTable('headers.title')}
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium pr-6">
                {tTable('headers.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="h-32 text-center text-muted-foreground">
                  {tCommon('no_results')}
                </TableCell>
              </TableRow>
            ) : (
              groupedRows
            )}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5 bg-white/5">
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page <= 1}
            className="bg-white/5 hover:bg-white/10 border-white/10"
          >
            <Link href={buildPageLink(page - 1)}>{tCommon('previous')}</Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            {tCommon('pagination.pageOf', { page, total: pagination.totalPages })}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            className="bg-white/5 hover:bg-white/10 border-white/10"
          >
            <Link href={buildPageLink(page + 1)}>{tCommon('next')}</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
