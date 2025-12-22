import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations } from 'next-intl/server';

export async function ClaimsStatsCard({
  counts,
}: {
  counts: { total: number; open: number; resolved: number; rejected: number };
}) {
  const t = await getTranslations('admin.member_profile');

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
