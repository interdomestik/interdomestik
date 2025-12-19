import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { claims, db, user } from '@interdomestik/database';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { desc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

export default async function AgentClaimsPage() {
  const t = await getTranslations('agent');

  const allClaims = await db
    .select({
      id: claims.id,
      title: claims.title,
      status: claims.status,
      createdAt: claims.createdAt,
      companyName: claims.companyName,
      claimAmount: claims.claimAmount,
      currency: claims.currency,
      claimantName: user.name,
      claimantEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .orderBy(desc(claims.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('claims_queue')}</h1>
          <p className="text-muted-foreground">{t('manage_triage')}</p>
        </div>
      </div>

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
            {allClaims.map(claim => (
              <TableRow key={claim.id}>
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
                <TableCell className="text-sm">
                  {claim.claimAmount ? `${claim.claimAmount} ${claim.currency || 'EUR'}` : '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/agent/claims/${claim.id}`}>{t('actions.review')}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {allClaims.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('table.no_claims')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
