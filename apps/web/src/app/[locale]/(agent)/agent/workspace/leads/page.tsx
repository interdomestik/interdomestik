import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { db, memberLeads } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentWorkspaceLeadsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  // Reusing same optimized query as Lite, client side filtering for now as requested
  const leadsData = await db.query.memberLeads.findMany({
    where: eq(memberLeads.tenantId, tenantId),
    orderBy: (leads, { desc }) => [desc(leads.createdAt)],
    with: {
      branch: true,
    },
  });

  return <AgentLeadsProPage leads={leadsData} />;
}
