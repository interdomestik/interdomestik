import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Progress } from '@interdomestik/ui/components/progress';
import { BarChart3, Euro, TrendingUp, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getAdminAnalyticsDataCore } from './_core';

export default async function AdminAnalyticsPage() {
  const t = await getTranslations('admin.analytics');
  const tStatus = await getTranslations('claims.status');
  const tCategory = await getTranslations('claims.category');
  const { totals, statusDistribution, categoryDistribution, activeClaimants, successRate } =
    await getAdminAnalyticsDataCore();

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
                Number(totals.sum)
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
                Number(totals.avg)
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
                  <Progress
                    value={totals.count > 0 ? (Number(item.count) / totals.count) * 100 : 0}
                    className="h-2"
                  />
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
                    <span>{tCategory(item.category || 'default')}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <Progress
                    value={totals.count > 0 ? (Number(item.count) / totals.count) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
