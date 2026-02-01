'use client';

import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { fetchClaims } from '@/lib/api/claims';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

const PER_PAGE = 10;

export function MemberClaimsTable() {
  const searchParams = useSearchParams();
  const t = useTranslations('claims');
  const tCommon = useTranslations('common');

  const statusFilter = searchParams.get('status') || undefined;
  const searchQuery = searchParams.get('search') || undefined;
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const { data, isLoading, isError, refetch } = useQuery({
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

  if (isLoading) {
    return (
      <div className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
        {tCommon('loading')}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="text-sm text-muted-foreground">{tCommon('errors.generic')}</div>
          <Button variant="outline" onClick={() => refetch()}>
            {tCommon('tryAgain')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (data.claims.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-6 mb-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
            {searchQuery || statusFilter ? t('empty.filtered') : t('empty.description')}
          </p>
          {!searchQuery && !statusFilter && (
            <Button asChild>
              <Link href="/member/claims/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('empty.createFirst')}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.title')}</TableHead>
              <TableHead>{t('table.company')}</TableHead>
              <TableHead>{t('table.category')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead>{t('table.amount')}</TableHead>
              <TableHead className="text-right">{t('table.created')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.claims.map(claim => (
              <TableRow key={claim.id} className="hover:bg-muted/50 cursor-pointer">
                <TableCell className="font-medium">
                  <Link
                    href={`/member/claims/${claim.id}`}
                    className="hover:underline underline-offset-4 block max-w-[240px] truncate"
                    title={claim.title}
                  >
                    {claim.title}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[200px] truncate" title={claim.companyName || ''}>
                  {claim.companyName}
                </TableCell>
                <TableCell className="capitalize text-sm text-muted-foreground">
                  {claim.category}
                </TableCell>
                <TableCell>
                  <ClaimStatusBadge status={claim.status} />
                </TableCell>
                <TableCell>
                  {claim.claimAmount ? (
                    <span className="font-medium">
                      €{Number.parseFloat(claim.claimAmount).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm" suppressHydrationWarning>
                  {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t('showing')} {data.claims.length}{' '}
          {data.claims.length === 1 ? t('claim') : t('claimsPlural')}
        </p>
        {data.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={buildPageLink(page - 1)}>{tCommon('previous')}</Link>
            </Button>
            <span className="text-sm text-muted-foreground">
              {tCommon('pagination.pageOf', { page, total: data.totalPages })}
            </span>
            <Button asChild variant="outline" size="sm" disabled={page >= data.totalPages}>
              <Link href={buildPageLink(page + 1)}>{tCommon('next')}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
