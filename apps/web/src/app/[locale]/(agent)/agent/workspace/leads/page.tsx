import { AgentLeadsProPage } from '@/features/agent/leads/components/AgentLeadsProPage';
import { auth } from '@/lib/auth';
import { withTenantContext } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentWorkspaceLeadsCore } from './_core';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AgentWorkspaceLeadsPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const tenantId = ensureTenantId(session);

  const { leads } = await withTenantContext({ tenantId }, tx =>
    getAgentWorkspaceLeadsCore({
      tenantId,
      db: tx,
    })
  );

  return <AgentLeadsProPage leads={leads} />;
}
