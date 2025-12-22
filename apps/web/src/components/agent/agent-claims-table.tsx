'use client';

import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { fetchClaims } from '@/lib/api/claims';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

const PER_PAGE = 20;

export function AgentClaimsTable({ userRole }: { userRole?: string }) {
  const t = useTranslations('agent-claims.claims');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();

  const isAgent = userRole === 'agent';

  // ... (omitted)

  // inside return
  const statusFilter = searchParams.get('status') || undefined;
  const searchQuery = searchParams.get('search') || undefined;
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['claims', 'agent_queue', { statusFilter, searchQuery, page }],
    queryFn: ({ signal }) =>
      fetchClaims({
        scope: 'agent_queue',
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
      <div className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
        <div>{tCommon('errors.generic')}</div>
        <Button className="mt-4" variant="outline" onClick={() => refetch()}>
          {tCommon('tryAgain')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.claimant')}</TableHead>
              <TableHead>{t('table.claim')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead>{t('table.amount')}</TableHead>
              <TableHead>{t('table.date')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.claims.map(claim => (
              <TableRow
                key={claim.id}
                className={
                  claim.unreadCount ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-muted/50'
                }
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{claim.claimantName || 'Unknown'}</span>
                    <span
                      className="text-xs text-muted-foreground truncate max-w-[200px]"
                      title={claim.claimantEmail || ''}
                    >
                      {claim.claimantEmail}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="font-medium text-sm truncate" title={claim.title}>
                    {claim.title}
                  </div>
                  <div
                    className="text-xs text-muted-foreground truncate"
                    title={claim.companyName || ''}
                  >
                    {claim.companyName}
                  </div>
                </TableCell>
                <TableCell>
                  <ClaimStatusBadge status={claim.status} />
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {claim.claimAmount ? `${claim.claimAmount} ${claim.currency || 'EUR'}` : '-'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {!isAgent ? (
                    claim.unreadCount ? (
                      <Button
                        asChild
                        size="sm"
                        className="gap-2 animate-pulse bg-amber-500 text-white hover:bg-amber-600"
                      >
                        <Link href={`/agent/claims/${claim.id}`}>
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                          </span>
                          {t('table.message_alert', { count: claim.unreadCount })}
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/agent/claims/${claim.id}`}>{t('actions.review')}</Link>
                      </Button>
                    )
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/agent/claims/${claim.id}`}>View Status</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {data.claims.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('table.no_claims')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
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
  );
}
