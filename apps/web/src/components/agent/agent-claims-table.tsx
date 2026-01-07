'use client';

import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { fetchClaims, type ClaimsScope } from '@/lib/api/claims';
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

function renderActionButtons({
  isAgent,
  unreadCount,
  claimId,
  detailBasePath,
  t,
}: {
  isAgent: boolean;
  unreadCount: number;
  claimId: string;
  detailBasePath: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (isAgent) {
    return (
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="text-slate-500 hover:text-primary hover:bg-primary/5 font-medium transition-colors"
      >
        <Link href={`${detailBasePath}/${claimId}`}>View Status</Link>
      </Button>
    );
  }

  if (unreadCount) {
    return (
      <Button
        asChild
        size="sm"
        className="gap-2 shadow-sm shadow-amber-500/20 bg-amber-500 text-white hover:bg-amber-600 border-amber-600/20 font-semibold"
      >
        <Link href={`${detailBasePath}/${claimId}`}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          {t('table.message_alert', { count: unreadCount })}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="font-medium text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
    >
      <Link href={`${detailBasePath}/${claimId}`}>{t('actions.review')}</Link>
    </Button>
  );
}

export function AgentClaimsTable({
  userRole,
  scope = 'agent_queue',
  detailBasePath = '/member/claims',
}: {
  userRole?: string;
  scope?: ClaimsScope;
  detailBasePath?: string;
}) {
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
    queryKey: ['claims', scope, { statusFilter, searchQuery, page }],
    queryFn: ({ signal }) =>
      fetchClaims({
        scope,
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
                  claim.unreadCount
                    ? 'bg-amber-50/50 hover:bg-amber-50/80 transition-colors duration-200'
                    : 'hover:bg-slate-50/80 transition-colors duration-200'
                }
              >
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-slate-900 text-sm tracking-tight">
                      {claim.claimantName || 'Unknown'}
                    </span>
                    <span
                      className="text-xs text-slate-500 font-medium truncate max-w-[200px]"
                      title={claim.claimantEmail || ''}
                    >
                      {claim.claimantEmail}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="font-medium text-slate-900 text-sm truncate tracking-tight"
                      title={claim.title}
                    >
                      {claim.title}
                    </span>
                    <span
                      className="text-xs text-slate-500 truncate font-medium"
                      title={claim.companyName || ''}
                    >
                      {claim.companyName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <ClaimStatusBadge status={claim.status} />
                </TableCell>
                <TableCell className="text-sm font-semibold text-slate-700 font-mono tracking-tight">
                  {claim.claimAmount ? (
                    `${claim.claimAmount} ${claim.currency || 'EUR'}`
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-slate-500 font-medium">
                  {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {renderActionButtons({
                    isAgent,
                    unreadCount: claim.unreadCount || 0,
                    claimId: claim.id,
                    detailBasePath,
                    t,
                  })}
                </TableCell>
              </TableRow>
            ))}
            {data.claims.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-2">
                      <span className="text-2xl">📭</span>
                    </div>
                    <span className="font-medium text-lg">{t('table.no_claims')}</span>
                    <span className="text-sm text-slate-400">
                      Claims will appear here once submitted.
                    </span>
                  </div>
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
