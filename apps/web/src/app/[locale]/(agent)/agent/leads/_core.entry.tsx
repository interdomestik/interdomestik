import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { agentSettings } from '@interdomestik/database/schema';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { eq } from 'drizzle-orm';
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

  // Tier Gating (Strict)
  // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
  const settings = await withTenantAuthority(authority, tx =>
    tx.query.agentSettings.findFirst({
      where: eq(agentSettings.agentId, session.user.id),
      columns: { tier: true },
    })
  );
  const tier = settings?.tier || 'standard';

  if (!['pro', 'office'].includes(tier)) {
    notFound();
  }

  const branchId = session.user.branchId;
  const leadsData = await withTenantAuthority(authority, tx =>
    getAgentLeadsCore({ tenantId, agentId: session.user.id, branchId }, { db: tx })
  );

  return <AgentLeadsProPage leads={leadsData} />;
}
