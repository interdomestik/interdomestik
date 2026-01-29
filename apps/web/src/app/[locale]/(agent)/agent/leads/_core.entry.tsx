import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentLeadsCore } from './_core';

export default async function AgentLeadsEntry() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  const leadsData = await getAgentLeadsCore({ tenantId, agentId: session.user.id }, { db });

  return <AgentLeadsProPage leads={leadsData} />;
}
