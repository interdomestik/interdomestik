import { claims, db } from '@interdomestik/database';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { count, eq, sql } from 'drizzle-orm';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function AgentDashboardPage() {
  const t = await getTranslations('agent');

  // Fetch stats (MVP: minimal optimization)
  const [totalClaims] = await db.select({ count: count() }).from(claims);
  const [submittedClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'submitted'));
  const [verificationClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'verification'));
  const [resolvedClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(sql`${claims.status} = 'resolved' OR ${claims.status} = 'rejected'`);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('dashboard')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.total')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClaims.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.new')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submittedClaims.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.verification')}</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verificationClaims.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.closed')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedClaims.count}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity or list could go here */}
      <div className="rounded-md border p-8 text-center text-muted-foreground bg-muted/20">
        {t('table.no_claims_ready', { defaultValue: 'Claim List Coming Soon' })}
      </div>
    </div>
  );
}
