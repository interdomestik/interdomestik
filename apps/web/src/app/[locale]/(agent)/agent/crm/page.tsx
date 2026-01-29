import { LeaderboardCard } from '@/components/agent/leaderboard-card';
import { PipelineChart } from '@/components/agent/pipeline-chart';
import { auth } from '@/lib/auth'; // server-side auth
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAgentCrmStatsCore } from './_core';

export default async function CRMPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/auth/login');
  }

  const agentId = session.user.id;

  const stats = await getAgentCrmStatsCore({ agentId });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('crm')}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Stats */}
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.new')}</div>
          <div className="text-2xl font-bold">{stats.newLeadsCount}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.verification')}</div>
          <div className="text-2xl font-bold">{stats.contactedLeadsCount}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.closed')}</div>
          <div className="text-2xl font-bold">{stats.closedWonDealsCount}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('commissions.title')}</div>
          <div className="text-2xl font-bold">€ {stats.paidCommissionTotal.toFixed(2)}</div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4">
          <PipelineChart
            data={{
              newLeads: stats.newLeadsCount,
              contactedLeads: stats.contactedLeadsCount,
              wonDeals: stats.closedWonDealsCount,
            }}
          />
        </div>
        <div className="col-span-3">
          <LeaderboardCard />
        </div>
      </div>
    </div>
  );
}
