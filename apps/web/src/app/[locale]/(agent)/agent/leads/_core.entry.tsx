import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { agentSettings } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAgentLeadsCore } from './_core';

export default async function AgentLeadsEntry() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  // Tier Gating (Strict)
  const settings = await db.query.agentSettings.findFirst({
    where: eq(agentSettings.agentId, session.user.id),
    columns: { tier: true },
  });
  const tier = settings?.tier || 'standard';

  if (!['pro', 'office'].includes(tier)) {
    notFound();
  }

  const leadsData = await getAgentLeadsCore({ tenantId, agentId: session.user.id }, { db });

  return <AgentLeadsProPage leads={leadsData} />;
}
