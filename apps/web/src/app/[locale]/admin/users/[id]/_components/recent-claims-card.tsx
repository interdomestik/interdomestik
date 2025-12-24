import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { getTranslations } from 'next-intl/server';
import { formatDate } from './utils';

interface RecentClaim {
  id: string;
  title: string | null;
  status: string;
  claimAmount: string | null;
  currency: string | null;
  createdAt: Date | null;
}

export async function RecentClaimsCard({ recentClaims }: { recentClaims: RecentClaim[] }) {
  const t = await getTranslations('admin.member_profile');
  const tClaims = await getTranslations('claims');
  const tCommon = await getTranslations('common');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.recent_claims')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tClaims('table.title')}</TableHead>
                <TableHead>{tClaims('table.status')}</TableHead>
                <TableHead>{tClaims('table.created')}</TableHead>
                <TableHead className="text-right">{t('actions.view_claim')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentClaims.map(claim => (
                <TableRow key={claim.id}>
                  <TableCell className="max-w-[240px]">
                    <div className="truncate" title={claim.title ?? undefined}>
                      {claim.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {claim.claimAmount
                        ? `${claim.claimAmount} ${claim.currency || 'EUR'}`
                        : tCommon('none')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ClaimStatusBadge status={claim.status} />
                  </TableCell>
                  <TableCell>{formatDate(claim.createdAt || undefined, tCommon('none'))}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/claims/${claim.id}`}>{tCommon('view')}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {recentClaims.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    {t('labels.no_claims')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
