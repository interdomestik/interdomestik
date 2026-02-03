import { getMyCommissionSummary } from '@/actions/commissions';
import { getAgentDashboardV2StatsCore } from '@/app/[locale]/(agent)/agent/_core';
import { AgentVerifiedID } from '@/components/agent/agent-verified-id';
import { LeaderboardCard } from '@/components/agent/leaderboard-card';
import { PipelineChart } from '@/components/agent/pipeline-chart';
import { ReferralLinkCard } from '@/components/agent/referral-link-card';
import { MatteAnchorCard } from '@/components/dashboard/matte-anchor-card';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { ArrowRight, UserPlus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function AgentDashboardV2Page({
  locale,
  tier = 'standard',
}: {
  locale: string;
  tier?: string;
}) {
  setRequestLocale(locale);

  const t = await getTranslations('agent');
  const tToolkit = await getTranslations('agent-toolkit');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/auth/login');
  }

  const agentId = session.user.id;

  const stats = await getAgentDashboardV2StatsCore({ agentId }, { db });

  // Get commission summary
  const summaryResult = await getMyCommissionSummary();

  const summary = summaryResult.success ? summaryResult.data : null;

  const isPro = ['pro', 'office'].includes(tier);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('dashboard')} —{' '}
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            {isPro ? (
              <Link href="/agent/leads/new">
                Add New Lead <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            ) : (
              <Link href="/agent/pos">
                Rapid POS Sale <UserPlus className="ml-2 h-4 w-4" />
              </Link>
            )}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/member" data-testid="agent-member-dashboard-cta">
              My Member Dashboard
            </Link>
          </Button>
        </div>
      </div>

      {/* NEW: Hero Row (Phase A) */}
      <div className="grid gap-6 lg:grid-cols-3 items-stretch">
        {/* Left: Verified ID */}
        <div className="flex items-center justify-center lg:justify-start">
          <AgentVerifiedID
            name={session.user.name ?? 'Agent'}
            agentId={agentId}
            createdAt={session.user.createdAt ?? new Date()}
          />
        </div>

        {/* Center: Earnings Velocity Meter */}
        <Card className="relative overflow-hidden border-white/10 bg-slate-950/40 backdrop-blur-2xl group selection:none">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">
              Ritmi mujor
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            <div className="text-5xl font-black tracking-tighter text-white tabular-nums drop-shadow-2xl">
              €{summary ? ((summary.totalPaid ?? 0) / 100).toFixed(0) : '—'}
            </div>
            <p className="text-[10px] font-medium text-white/40 mt-2 uppercase tracking-widest">
              Paguar këtë muaj
            </p>
          </CardContent>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
            <div className="h-full w-1/3 bg-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-shimmer" />
          </div>
        </Card>

        {/* Right: Pipeline Pulse */}
        {/* Right: Pipeline Pulse (Pro) or Client Summary (Lite) */}
        <Card className="border-white/10 bg-slate-950/40 backdrop-blur-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
              {isPro ? 'Pipeline Pulse' : 'Client Base'}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={
              isPro
                ? 'grid grid-cols-3 gap-2 py-4'
                : 'flex flex-col items-center justify-center py-4'
            }
          >
            {isPro ? (
              <>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl font-black text-white" data-testid="agent-pulse-active">
                    {stats.newLeads + stats.contactedLeads}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter text-slate-500">
                    Aktive
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl font-black text-white" data-testid="agent-pulse-won">
                    {stats.wonDeals}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter text-slate-500">
                    Të fituara
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl font-black text-white" data-testid="agent-pulse-cr">
                    {(() => {
                      const total = stats.newLeads + stats.contactedLeads + stats.wonDeals;
                      if (total === 0) return '0%';
                      return `${Math.round((stats.wonDeals / total) * 100)}%`;
                    })()}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter text-slate-500">
                    Konvertimi
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 pt-2">
                <span className="text-4xl font-black text-white" data-testid="agent-total-clients">
                  {stats.clientCount}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-500">
                  Total Clients
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* NEW: Diaspora Toolkit (The Final 4) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MatteAnchorCard
          label={tToolkit('campaign.title')}
          description="Gjuetia (Hunt)"
          iconName="share"
          href="/agent/toolkit/campaign"
          colorClassName="from-indigo-950/40 to-slate-950/60"
          testId="action-campaign"
        />
        <MatteAnchorCard
          label={isPro ? 'Rapid Prospect' : 'Rapid POS'}
          description={isPro ? 'Shto Lead' : 'Shitje e Shpejtë'}
          iconName="user-plus"
          href={isPro ? '/agent/leads/new' : '/agent/pos'}
          colorClassName="from-slate-900/60 to-slate-950/80"
          testId="action-prospect"
        />
        <MatteAnchorCard
          label="Earnings Boost"
          description="Komisionet"
          iconName="trending-up"
          href="/agent/commissions"
          colorClassName="from-emerald-950/40 to-slate-950/60"
          testId="action-commissions"
        />
        <MatteAnchorCard
          label={tToolkit('guides.title')}
          description="Ekspertiza"
          iconName="globe"
          href="/agent/toolkit/guides"
          colorClassName="from-slate-900/60 to-slate-950/80"
          testId="action-guides"
        />
      </div>

      {/* Preservation of existing features (relayouted) */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          {isPro && <PipelineChart data={stats} />}
          <LeaderboardCard />
        </div>

        <div className="lg:col-span-4 space-y-6">
          <ReferralLinkCard />
          <Card className="border-white/5 bg-slate-950/20">
            <CardHeader>
              <CardTitle>Commission Summary</CardTitle>
              <CardDescription>Existing data preserved</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center" data-testid="commission-pending">
                <span className="text-sm text-muted-foreground">Pending</span>
                <span className="font-semibold">
                  €{((summary?.totalPending ?? 0) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center" data-testid="commission-approved">
                <span className="text-sm text-muted-foreground">Approved</span>
                <span className="font-semibold text-green-600">
                  €{((summary?.totalApproved ?? 0) / 100).toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Your Clients */}
        <div className="lg:col-span-12">
          <Card>
            <CardHeader>
              <CardTitle>Your Clients</CardTitle>
              <CardDescription>
                Members you've signed up ({stats.clientCount} total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                {stats.clientCount === 0 ? (
                  <div>
                    <p className="mb-4">No clients yet. Start selling memberships!</p>
                    <Button asChild>
                      {isPro ? (
                        <Link href="/agent/leads/new">Add Your First Lead</Link>
                      ) : (
                        <Link href="/agent/pos">Start Rapid POS Sale</Link>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button asChild variant="outline">
                    <Link href="/agent/clients">View All Clients</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
