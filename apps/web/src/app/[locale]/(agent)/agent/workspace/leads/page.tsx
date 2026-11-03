import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentWorkspaceLeadsCore } from './_core';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AgentWorkspaceLeadsPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    redirect(`/${locale}/login`);
  }

  const { authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);

  const { leads } = await withTenantAuthority(authority, tx =>
    getAgentWorkspaceLeadsCore({
      tenantId,
      db: tx,
    })
  );

  return <AgentLeadsProPage leads={leads} />;
}
