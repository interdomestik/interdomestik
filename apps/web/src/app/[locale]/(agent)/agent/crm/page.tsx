import { LeaderboardCard } from '@/components/agent/leaderboard-card';
import { auth } from '@/lib/auth'; // server-side auth
import { db } from '@interdomestik/database/db';
import { agentCommissions, crmDeals, crmLeads } from '@interdomestik/database/schema';
import { and, count, eq, sql } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function CRMPage({ params }: { params: Promise<{ locale: string }> }) {
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

  // Fetch Stats
  const [newLeads] = await db
    .select({ count: count() })
    .from(crmLeads)
    .where(and(eq(crmLeads.agentId, agentId), eq(crmLeads.stage, 'new')));

  const [contactedLeads] = await db
    .select({ count: count() })
    .from(crmLeads)
    .where(and(eq(crmLeads.agentId, agentId), eq(crmLeads.stage, 'contacted')));

  const [wonDeals] = await db
    .select({ count: count() })
    .from(crmDeals)
    .where(and(eq(crmDeals.agentId, agentId), eq(crmDeals.stage, 'closed_won')));

  const [totalCommission] = await db
    .select({ total: sql<number>`sum(${agentCommissions.amount})` })
    .from(agentCommissions)
    .where(and(eq(agentCommissions.agentId, agentId), eq(agentCommissions.status, 'paid')));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('crm')}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Stats */}
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.new')}</div>
          <div className="text-2xl font-bold">{newLeads?.count ?? 0}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.verification')}</div>
          <div className="text-2xl font-bold">{contactedLeads?.count ?? 0}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.closed')}</div>
          <div className="text-2xl font-bold">{wonDeals?.count ?? 0}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('commissions.title')}</div>
          <div className="text-2xl font-bold">
            € {Number(totalCommission?.total ?? 0).toFixed(2)}
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 bg-white rounded-lg border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Pipeline Overview</h3>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded">
            <span className="text-sm">Chart Placeholder (Pipeline visual coming soon)</span>
          </div>
        </div>
        <div className="col-span-3">
          <LeaderboardCard />
        </div>
      </div>
    </div>
  );
}
