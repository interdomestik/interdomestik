import { AgentLeadsOpsPage } from '@/features/agent/leads/components/AgentLeadsOpsPage';
import { auth } from '@/lib/auth';
import { db, memberLeads } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  const leadsData = await db.query.memberLeads.findMany({
    where: eq(memberLeads.tenantId, tenantId),
    orderBy: (leads, { desc }) => [desc(leads.createdAt)],
    with: {
      branch: true,
    },
  });

  return <AgentLeadsOpsPage leads={leadsData} />;
}
