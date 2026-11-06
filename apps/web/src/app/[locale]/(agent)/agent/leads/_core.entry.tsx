import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAgentLeadsCore } from './_core';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AgentLeadsEntry({ params }: Readonly<Props>) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  if (session.user.role !== 'agent') {
    notFound();
  }

  if (!session.user.branchId) {
    notFound();
  }

  const authorized = await authorizeSessionTenant(await headers());
  if (!authorized) {
    redirect(`/${locale}/login`);
  }
  const { authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);

  // Every branch agent records leads here: since ACQ-2 (owner D1 a) a lead with consent, paid and
  // approved, is the only way a member is enrolled, so the workspace is not limited to a tier.
  const branchId = session.user.branchId;
  const leadsData = await withTenantAuthority(authority, tx =>
    getAgentLeadsCore({ tenantId, agentId: session.user.id, branchId }, { db: tx })
  );

  return <AgentLeadsProPage leads={leadsData} />;
}
