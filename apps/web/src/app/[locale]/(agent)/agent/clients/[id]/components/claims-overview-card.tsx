import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';

import { AgentClientClaimCounts } from '../_core';

interface ClaimsOverviewCardProps {
  readonly counts: AgentClientClaimCounts;
  readonly t: (key: string) => string;
}

export function ClaimsOverviewCard({ counts, t }: ClaimsOverviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.claims_overview')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{t('claims.total')}</p>
            <p className="text-2xl font-semibold">{counts.total}</p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{t('claims.open')}</p>
            <p className="text-2xl font-semibold">{counts.open}</p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{t('claims.resolved')}</p>
            <p className="text-2xl font-semibold">{counts.resolved}</p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">{t('claims.rejected')}</p>
            <p className="text-2xl font-semibold">{counts.rejected}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
