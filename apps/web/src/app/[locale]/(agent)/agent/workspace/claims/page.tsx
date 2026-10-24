import { AgentClaimsProPage } from '@/features/agent/claims/components/AgentClaimsProPage';
import { auth } from '@/lib/auth';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getAgentWorkspaceClaimsCore } from './_core';

type SearchParams = {
  claimId?: string | string[];
  selected?: string | string[];
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
};

function getSearchParam(value: unknown): string | undefined {
  if (!value) return;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return;
  const first = value[0];
  return typeof first === 'string' ? first : void 0;
}

function resolveRequestedClaimId(searchParams: SearchParams): string | undefined {
  const selected = getSearchParam(searchParams.selected);
  if (selected) return selected;

  return getSearchParam(searchParams.claimId);
}

// Request-specific auth is read behind this boundary so the page shell can prerender.
export default function AgentWorkspaceClaimsPage(props: Props) {
  return (
    <Suspense
      fallback={
        <output
          aria-busy="true"
          className="block space-y-6"
          data-testid="agent-workspace-claims-loading"
        >
          <div aria-hidden="true" className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div aria-hidden="true" className="h-64 animate-pulse rounded bg-muted" />
        </output>
      }
    >
      <AgentWorkspaceClaimsContent {...props} />
    </Suspense>
  );
}

async function AgentWorkspaceClaimsContent({ params, searchParams }: Props) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const tenantId = ensureTenantId(session);
  const role = session.user.role;
  if (!role) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const selectedClaimId = resolveRequestedClaimId(resolvedSearchParams);

  const result = await getAgentWorkspaceClaimsCore({
    tenantId,
    userId: session.user.id,
    role,
    selectedClaimId,
  });

  if (!result.ok) {
    notFound();
  }

  return (
    <AgentClaimsProPage
      claims={result.claims}
      selectedClaimId={selectedClaimId}
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
        role,
      }}
    />
  );
}
