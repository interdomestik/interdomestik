'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Link } from '@/i18n/routing';
import { fetchClaims, type ClaimsListItem } from '@/lib/api/claims';
import { cn } from '@interdomestik/ui';
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
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ExternalLink } from 'lucide-react'; // Added ExternalLink
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
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
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-6 py-4 bg-white/5 hover:bg-white/10 transition-colors border-b border-white/10"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant="secondary" className="bg-white/10 text-muted-foreground border-white/10">
            {count}
          </Badge>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform text-muted-foreground', open && 'rotate-180')}
        />
      </button>
      {open && <div className="p-2">{children}</div>}
    </GlassCard>
  );
}

export function AdminClaimsTable() {
  const searchParams = useSearchParams();
  const tAdmin = useTranslations('admin.claims_page');
  const tTable = useTranslations('agent-claims.claims.table');
  const tStatus = useTranslations('claims.status');
  const tCommon = useTranslations('common');

  const withClaimsListContext = (href: string) => {
    const listQueryString = searchParams.toString();
    if (!listQueryString) return href;

    const [path, queryString] = href.split('?');
    const merged = new URLSearchParams(listQueryString);
    if (queryString) {
      const destinationParams = new URLSearchParams(queryString);
      const destinationKeys = new Set(Array.from(destinationParams.keys()));
      for (const key of destinationKeys) {
        merged.delete(key);
        for (const value of destinationParams.getAll(key)) {
          merged.append(key, value);
        }
      }
    }

    const next = merged.toString();
    return next ? `${path}?${next}` : path;
  };

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
        return 'bg-blue-500/15 text-blue-600 border-blue-500/20';
      case 'resolved':
        return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20';
      case 'rejected':
        return 'bg-red-500/15 text-red-600 border-red-500/20';
      case 'draft':
        return 'bg-slate-500/15 text-slate-600 border-slate-500/20';
      default:
        return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
    }
  };

  if (isLoading) {
    return (
      <GlassCard className="p-12 flex justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-pulse">
          <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <p>{tCommon('loading')}</p>
        </div>
      </GlassCard>
    );
  }

  if (isError || !data) {
    return (
      <GlassCard className="p-8 text-center text-muted-foreground">
        <p className="mb-4">{tCommon('errors.generic')}</p>
        <Button variant="outline" onClick={() => refetch()} className="hover:bg-primary/5">
          {tCommon('tryAgain')}
        </Button>
      </GlassCard>
    );
  }

  if (data.claims.length === 0) {
    return (
      <GlassCard className="p-12 text-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
            <ExternalLink className="h-6 w-6 opacity-50" />
          </div>
          <p>{tTable('no_claims')}</p>
        </div>
      </GlassCard>
    );
  }

  const renderTable = (claims: ClaimsListItem[]) => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-white/10">
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
            className={cn(
              'group border-white/5 transition-colors',
              claim.unreadCount
                ? 'bg-amber-500/5 hover:bg-amber-500/10'
                : 'hover:bg-white/5 dark:hover:bg-white/5'
            )}
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
              <Badge className={getStatusColor(claim.status)} variant="outline">
                {tStatus(claim.status || 'draft')}
              </Badge>
            </TableCell>
            <TableCell>
              {claim.claimAmount
                ? `${Number.parseFloat(claim.claimAmount).toFixed(2)} ${claim.currency || 'EUR'}`
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
                  variant="default"
                  className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 border-none shadow-md shadow-amber-500/20"
                >
                  <Link href={withClaimsListContext(`/admin/claims/${claim.id}`)}>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                    </span>
                    {tAdmin('message_alert', { count: claim.unreadCount })}
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="hover:bg-blue-500/10 hover:text-blue-600"
                >
                  <Link href={withClaimsListContext(`/admin/claims/${claim.id}`)}>
                    {tCommon('view')}
                  </Link>
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
    <div className="space-y-6">
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
            {tCommon('pagination.pageOf', { page, total: data.totalPages })}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            className="bg-white/5 hover:bg-white/10 border-white/10"
          >
            <Link href={buildPageLink(page + 1)}>{tCommon('next')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
