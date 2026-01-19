import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentWorkspaceLeadsCore } from './_core';

export default async function AgentWorkspaceLeadsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  const { leads } = await getAgentWorkspaceLeadsCore({
    tenantId,
    db,
  });

  return <AgentLeadsProPage leads={leads} />;
}
