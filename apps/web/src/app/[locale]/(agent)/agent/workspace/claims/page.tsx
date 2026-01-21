import { AgentClaimsProPage } from '@/features/agent/claims/components/AgentClaimsProPage';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentWorkspaceClaimsCore } from './_core';

export default async function AgentWorkspaceClaimsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  const { claims } = await getAgentWorkspaceClaimsCore({
    tenantId,
    userId: session.user.id,
    db,
  });

  return (
    <AgentClaimsProPage
      claims={claims}
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
        role: session.user.role || 'agent',
      }}
    />
  );
}
