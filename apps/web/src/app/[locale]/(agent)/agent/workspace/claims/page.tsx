import { AgentClaimsProPage } from '@/features/agent/claims/components/AgentClaimsProPage';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentWorkspaceClaimsCore } from './_core';

type SearchParams = {
  claimId?: string | string[];
  selected?: string | string[];
};

type Props = {
  searchParams: Promise<SearchParams>;
};

function getSearchParam(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function resolveRequestedClaimId(searchParams: SearchParams): string | undefined {
  const selected = getSearchParam(searchParams.selected);
  if (selected) return selected;

  return getSearchParam(searchParams.claimId);
}

export default async function AgentWorkspaceClaimsPage({ searchParams }: Props) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);
  const resolvedSearchParams = await searchParams;
  const selectedClaimId = resolveRequestedClaimId(resolvedSearchParams);

  const { claims } = await getAgentWorkspaceClaimsCore({
    tenantId,
    userId: session.user.id,
    role: session.user.role,
    db,
    selectedClaimId,
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
