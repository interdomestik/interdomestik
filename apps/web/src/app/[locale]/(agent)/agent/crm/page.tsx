import { LeaderboardCard } from '@/components/agent/leaderboard-card';
import { PipelineChart } from '@/components/agent/pipeline-chart';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth'; // server-side auth
import { ensureTenantId } from '@interdomestik/shared-auth';
import { Button } from '@interdomestik/ui';
import { ArrowRight } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAgentCrmStatsCore } from './_core';

export default async function CRMPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent');
  const format = await getFormatter();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const agentId = session.user.id;
  const tenantId = ensureTenantId(session);

  const stats = await getAgentCrmStatsCore({ agentId, tenantId });
  const dueFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6" data-testid="agent-crm-page-ready">
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
          <div className="text-2xl font-bold">
            {format.number(stats.paidCommissionTotal, { style: 'currency', currency: 'EUR' })}
          </div>
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
      <section
        className="rounded-lg border bg-white p-6 shadow-sm"
        data-testid="agent-crm-due-follow-ups"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('followUps.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('followUps.description')}</p>
          </div>
          <div
            className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900"
            data-testid="agent-crm-due-follow-up-count"
          >
            {t('followUps.dueCount', { count: stats.dueFollowUps.length })}
          </div>
        </div>
        {stats.dueFollowUps.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t('followUps.empty')}</p>
        ) : (
          <div className="mt-6 divide-y">
            {stats.dueFollowUps.map(followUp => (
              <div
                key={followUp.activityId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                data-lead-id={followUp.leadId}
                data-testid="agent-crm-due-follow-up-row"
              >
                <div>
                  <p className="font-medium">{followUp.leadName || t('followUps.unknownLead')}</p>
                  <p className="text-sm text-muted-foreground">{followUp.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('followUps.scheduledFor', {
                      date: dueFormatter.format(new Date(followUp.scheduledAt)),
                    })}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/agent/leads/${followUp.leadId}`}
                    data-testid="agent-crm-due-follow-up-open"
                  >
                    {t('followUps.openLead')}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
