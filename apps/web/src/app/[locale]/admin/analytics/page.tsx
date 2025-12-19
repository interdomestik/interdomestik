import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Progress } from '@interdomestik/ui/components/progress';
import { sql } from 'drizzle-orm';
import { BarChart3, Euro, TrendingUp, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

async function getAnalyticsData() {
  const [totals] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
      avg: sql<number>`COALESCE(AVG(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(claims);

  const statusDistribution = await db
    .select({
      status: claims.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(claims)
    .groupBy(claims.status);

  const categoryDistribution = await db
    .select({
      category: claims.category,
      count: sql<number>`COUNT(*)`,
    })
    .from(claims)
    .groupBy(claims.category);

  const [activeClaimants] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${claims.userId})`,
    })
    .from(claims);

  const resolvedCount = statusDistribution.find(s => s.status === 'resolved')?.count || 0;
  const successRate = totals.count > 0 ? (resolvedCount / totals.count) * 100 : 0;

  return {
    totals,
    statusDistribution,
    categoryDistribution,
    activeClaimants: activeClaimants.count,
    successRate,
  };
}

export default async function AdminAnalyticsPage() {
  const t = await getTranslations('admin.analytics');
  const tStatus = await getTranslations('claims.status');
  const tCategory = await getTranslations('claims.category');
  const { totals, statusDistribution, categoryDistribution, activeClaimants, successRate } =
    await getAnalyticsData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('metrics.total_value')}</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                totals.sum
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('metrics.avg_value')}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                totals.avg
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('metrics.success_rate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('metrics.active_users')}</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeClaimants}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('status_distribution')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">{t('no_data')}</p>
            ) : (
              statusDistribution.map(item => (
                <div key={item.status || 'unknown'} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{tStatus(item.status || 'draft')}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <Progress value={(item.count / totals.count) * 100} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('category_distribution')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">{t('no_data')}</p>
            ) : (
              categoryDistribution.map(item => (
                <div key={item.category} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{tCategory(item.category)}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <Progress value={(item.count / totals.count) * 100} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
