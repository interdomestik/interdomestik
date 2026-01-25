import { getPublicStatsCore } from '@/app/[locale]/stats/_core';
import { CheckCircle, Clock, Shield, TrendingUp, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function StatsV2Page({ locale }: Readonly<{ locale: string }>) {
  setRequestLocale(locale);
  const t = await getTranslations('stats');

  const stats = await getPublicStatsCore();

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-primary/5 to-background"
      data-testid="stats-page-ready"
    >
      <div className="container max-w-5xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6"
            data-testid="stats-verified-badge"
          >
            <CheckCircle className="h-4 w-4" />
            {t('verifiedBadge')}
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4"
            data-testid="stats-title"
          >
            {t('title')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-16">
          <StatCard
            icon={<Users className="h-8 w-8" />}
            value={stats.totalClaims.toLocaleString()}
            label={t('totalClaims')}
            color="primary"
            testId="stats-card-total-claims"
          />
          <StatCard
            icon={<Shield className="h-8 w-8" />}
            value={`${stats.successRate}%`}
            label={t('successRate')}
            color="green"
            testId="stats-card-success-rate"
          />
          <StatCard
            icon={<TrendingUp className="h-8 w-8" />}
            value={`€${(stats.totalRecovered / 1000).toFixed(0)}K`}
            label={t('totalRecovered')}
            color="amber"
            testId="stats-card-total-recovered"
          />
          <StatCard
            icon={<Clock className="h-8 w-8" />}
            value={`<${stats.avgResponseTime}h`}
            label={t('avgResponse')}
            color="blue"
            testId="stats-card-avg-response"
          />
        </div>

        {/* Trust Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">{t('trustTitle')}</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">{t('trustDescription')}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="px-4 py-2 bg-muted rounded-lg text-sm font-medium">
              🔒 {t('dataSecurity')}
            </div>
            <div className="px-4 py-2 bg-muted rounded-lg text-sm font-medium">
              ✅ {t('verifiedResults')}
            </div>
            <div className="px-4 py-2 bg-muted rounded-lg text-sm font-medium">
              ⚖️ {t('legalCompliance')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
  testId,
}: Readonly<{
  icon: React.ReactNode;
  value: string;
  label: string;
  color: 'primary' | 'green' | 'amber' | 'blue';
  testId: string;
}>) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    blue: 'bg-blue-100 text-blue-600',
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-lg p-6 text-center group hover:scale-105 transition-transform"
      data-testid={testId}
    >
      <div className={`inline-flex p-4 rounded-2xl mb-4 ${colorClasses[color]}`}>{icon}</div>
      <div className="text-3xl font-bold mb-2">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
