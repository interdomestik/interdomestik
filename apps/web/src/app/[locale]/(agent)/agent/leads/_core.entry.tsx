import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAgentLeadsCore } from './_core';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The signed-in agent's own leads in its branch: `/agent/leads` and `/agent/workspace/leads`.
 * Role, agent, branch and tenant all come from one authorization result (the session and the
 * authority minted from it), never from the request or from a second session read (R-37).
 */
export default async function AgentLeadsEntry({ params }: Readonly<Props>) {
  const { locale } = await params;
  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    redirect(`/${locale}/login`);
  }

  const { session, authority } = authorized;
  // The agent layout also admits explicit agent-portal grants; only an agent session reads leads.
  if (session.user.role !== 'agent') {
    notFound();
  }

  // A blank branch is no branch; a set one is used exactly as the session carries it.
  const branchId = session.user.branchId;
  if (!branchId?.trim()) {
    notFound();
  }

  const { tenantId } = readTenantAuthority(authority);

  // Every branch agent records leads here: since ACQ-2 (owner D1 a) a lead with consent, paid and
  // approved, is the only way a member is enrolled, so the workspace is not limited to a tier.
  const leadsData = await withTenantAuthority(authority, tx =>
    getAgentLeadsCore({ tenantId, agentId: session.user.id, branchId }, { db: tx })
  );

  return <AgentLeadsProPage leads={leadsData} />;
}
