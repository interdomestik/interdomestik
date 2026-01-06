import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';

import { AgentClientProfileOk } from '../_core';

interface RecentClaimsCardProps {
  recentClaims: AgentClientProfileOk['recentClaims'];
  t: (key: string) => string;
  tClaims?: (key: string) => string;
}

export function RecentClaimsCard({ recentClaims, t, tClaims }: RecentClaimsCardProps) {
  if (!tClaims) return null;
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
                <TableHead>{tClaims('table.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentClaims.map(claim => (
                <TableRow key={claim.id}>
                  <TableCell>
                    <ClaimStatusBadge status={claim.status} />
                  </TableCell>
                </TableRow>
              ))}
              {recentClaims.length === 0 && (
                <TableRow>
                  <TableCell colSpan={1} className="h-24 text-center text-muted-foreground">
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
