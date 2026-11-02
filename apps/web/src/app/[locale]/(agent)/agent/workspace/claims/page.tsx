import { AgentClaimsProPage } from '@/features/agent/claims/components/AgentClaimsProPage';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentWorkspaceClaimsCore } from './_core';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type SearchParams = {
  claimId?: string | string[];
  selected?: string | string[];
};

type Props = {
  params: Promise<{ locale: string }>;
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

export default async function AgentWorkspaceClaimsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    redirect(`/${locale}/login`);
  }

  const { session, authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);
  const resolvedSearchParams = await searchParams;
  const selectedClaimId = resolveRequestedClaimId(resolvedSearchParams);

  const { claims } = await withTenantAuthority(authority, tx =>
    getAgentWorkspaceClaimsCore({
      tenantId,
      userId: session.user.id,
      db: tx,
      selectedClaimId,
    })
  );

  return (
    <AgentClaimsProPage
      claims={claims}
      selectedClaimId={selectedClaimId}
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
        role: session.user.role || 'agent',
      }}
    />
  );
}
