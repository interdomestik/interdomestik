import { getMyCommissionSummary } from '@/actions/commissions';
import { LeaderboardCard } from '@/components/agent/leaderboard-card';
import { PipelineChart } from '@/components/agent/pipeline-chart';
import { ReferralLinkCard } from '@/components/agent/referral-link-card';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { ArrowRight, DollarSign, TrendingUp, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentDashboardStatsCore } from './_core';

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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

  const stats = await getAgentDashboardStatsCore({ agentId });

  // Get commission summary
  const summaryResult = await getMyCommissionSummary();
  const summary = summaryResult.success ? summaryResult.data : null;

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
        <Button asChild>
          <Link href="/agent/leads/new">
            Add New Lead <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.newLeads}</div>
            <p className="text-xs text-muted-foreground">Awaiting first contact</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contacted</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.contactedLeads}</div>
            <p className="text-xs text-muted-foreground">In your pipeline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deals Won</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.wonDeals}</div>
            <p className="text-xs text-muted-foreground">Memberships sold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{stats.totalPaidCommission.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Paid commissions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Pipeline Overview & Leaderboard */}
        <div className="lg:col-span-8 space-y-6">
          <PipelineChart data={stats} />

          {/* Leaderboard - Gamification */}
          <LeaderboardCard />
        </div>

        {/* Sidebar: Referral Link & Commissions */}
        <div className="lg:col-span-4 space-y-6">
          {/* Revenue Enabler: Copy Link */}
          <ReferralLinkCard />

          <Card>
            <CardHeader>
              <CardTitle>Commission Summary</CardTitle>
              <CardDescription>Your earnings overview</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pending</span>
                <span className="font-semibold">
                  €{((summary?.totalPending ?? 0) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Approved</span>
                <span className="font-semibold text-green-600">
                  €{((summary?.totalApproved ?? 0) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Paid</span>
                <span className="font-semibold">
                  €{((summary?.totalPaid ?? 0) / 100).toFixed(2)}
                </span>
              </div>
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link href="/agent/commissions">View All Commissions</Link>
              </Button>
            </CardFooter>
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
                      <Link href="/agent/leads/new">Add Your First Lead</Link>
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
