'use client';

import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

interface Claim {
  id: string;
  title: string;
  status: string | null;
  createdAt: Date | null;
  companyName: string | null;
  claimAmount: string | number | null;
  currency: string | null;
  claimantName: string | null;
  claimantEmail: string | null;
}

interface AgentClaimsTableProps {
  claims: Claim[];
}

export function AgentClaimsTable({ claims }: AgentClaimsTableProps) {
  const t = useTranslations('agent');

  return (
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
          {claims.map(claim => (
            <TableRow key={claim.id} className="hover:bg-muted/50">
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{claim.claimantName || 'Unknown'}</span>
                  <span className="text-xs text-muted-foreground">{claim.claimantEmail}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium text-sm">{claim.title}</div>
                <div className="text-xs text-muted-foreground">{claim.companyName}</div>
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
                <Button asChild size="sm" variant="outline">
                  <Link href={`/agent/claims/${claim.id}`}>{t('actions.review')}</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {claims.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                {t('table.no_claims')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
