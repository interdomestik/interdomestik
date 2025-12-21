'use client';

import { fetchClaims, type ClaimsListItem } from '@/lib/api/claims';
import { Link } from '@/i18n/routing';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { cn } from '@interdomestik/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

const PER_PAGE = 20;

type ClaimsSectionProps = {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

function ClaimsSection({ title, count, defaultOpen = true, children }: ClaimsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-md border bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground">({count})</span>
        </div>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </section>
  );
}

export function AdminClaimsTable() {
  const searchParams = useSearchParams();
  const tAdmin = useTranslations('admin.claims_page');
  const tTable = useTranslations('agent.table');
  const tStatus = useTranslations('claims.status');
  const tCommon = useTranslations('common');

  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const statusFilter = searchParams.get('status') || undefined;
  const searchQuery = searchParams.get('search') || undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['claims', 'admin', { page, statusFilter, searchQuery }],
    queryFn: ({ signal }) =>
      fetchClaims({
        scope: 'admin',
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

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 hover:bg-red-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
    }
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

  if (data.claims.length === 0) {
    return (
      <div className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
        {tTable('no_claims')}
      </div>
    );
  }

  const renderTable = (claims: ClaimsListItem[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tTable('claimant')}</TableHead>
          <TableHead>{tAdmin('table.title')}</TableHead>
          <TableHead>{tTable('status')}</TableHead>
          <TableHead>{tAdmin('table.amount')}</TableHead>
          <TableHead>{tTable('date')}</TableHead>
          <TableHead className="text-right">{tTable('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {claims.map(claim => (
          <TableRow
            key={claim.id}
            className={claim.unreadCount ? 'bg-amber-50/40 hover:bg-amber-50/60' : undefined}
          >
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{claim.claimantName || 'Unknown'}</span>
                <span className="text-xs text-muted-foreground">{claim.claimantEmail}</span>
              </div>
            </TableCell>
            <TableCell className="font-medium max-w-[240px]">
              <div className="truncate" title={claim.title}>
                {claim.title}
              </div>
              <div
                className="text-xs text-muted-foreground capitalize truncate"
                title={claim.category || ''}
              >
                {claim.category}
              </div>
            </TableCell>
            <TableCell>
              <Badge className={getStatusColor(claim.status)} variant="secondary">
                {tStatus(claim.status || 'draft')}
              </Badge>
            </TableCell>
            <TableCell>
              {claim.claimAmount
                ? `${parseFloat(claim.claimAmount).toFixed(2)} ${claim.currency || 'EUR'}`
                : '-'}
            </TableCell>
            <TableCell>
              {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
            </TableCell>
            <TableCell className="text-right">
              {claim.unreadCount ? (
                <Button
                  asChild
                  size="sm"
                  className="gap-2 animate-pulse bg-amber-500 text-white hover:bg-amber-600"
                >
                  <Link href={`/admin/claims/${claim.id}`}>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                    </span>
                    {tAdmin('message_alert', { count: claim.unreadCount })}
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/claims/${claim.id}`}>{tCommon('view')}</Link>
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const draftClaims = data.claims.filter(claim => (claim.status || 'draft') === 'draft');
  const resolvedClaims = data.claims.filter(claim =>
    ['resolved', 'rejected'].includes(claim.status || '')
  );
  const activeClaims = data.claims.filter(
    claim =>
      (claim.status || 'draft') !== 'draft' &&
      !['resolved', 'rejected'].includes(claim.status || '')
  );

  return (
    <div className="space-y-4">
      <div className="space-y-6">
        {activeClaims.length > 0 && (
          <ClaimsSection title={tAdmin('sections.active')} count={activeClaims.length}>
            {renderTable(activeClaims)}
          </ClaimsSection>
        )}
        {draftClaims.length > 0 && (
          <ClaimsSection
            title={tAdmin('sections.draft')}
            count={draftClaims.length}
            defaultOpen={false}
          >
            {renderTable(draftClaims)}
          </ClaimsSection>
        )}
        {resolvedClaims.length > 0 && (
          <ClaimsSection
            title={tAdmin('sections.resolved')}
            count={resolvedClaims.length}
            defaultOpen={false}
          >
            {renderTable(resolvedClaims)}
          </ClaimsSection>
        )}
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
