import { AgentDashboardLite } from '@/features/agent/dashboard/components/AgentDashboardLite';
import { auth } from '@/lib/auth';
import { claims, db, memberLeads } from '@interdomestik/database';
import { and, count, eq, inArray, not } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { locale } = (await params) as any;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const agentId = session.user.id;

  // Fetch New Leads Count
  const [newLeadsResult] = await db
    .select({ count: count() })
    .from(memberLeads)
    .where(and(eq(memberLeads.agentId, agentId), eq(memberLeads.status, 'new')));

  // Fetch Active Claims Count (placeholder query structure, currently used for tile)
  // Logic: Agent is owner/assigned, status is NOT closed/rejected/etc.
  const [activeClaimsResult] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.agentId, agentId), not(inArray(claims.status, ['resolved', 'rejected']))));

  return (
    <AgentDashboardLite
      locale={locale}
      newLeadsCount={newLeadsResult?.count ?? 0}
      activeClaimsCount={activeClaimsResult?.count ?? 0}
      followUpsCount={0} // Placeholder
    />
  );
}
