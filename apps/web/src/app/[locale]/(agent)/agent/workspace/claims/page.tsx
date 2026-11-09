import { LocalizedPageSkeleton } from '@/components/ui/page-skeleton';
import { AgentClaimsProPage } from '@/features/agent/claims/components/AgentClaimsProPage';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

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
export default function AgentWorkspaceClaimsPage(props: Readonly<Props>) {
  return (
    <Suspense
      fallback={
        <LocalizedPageSkeleton
          titleKey="agent.claimsPro.title"
          variant="list"
          testId="agent-workspace-claims-loading"
        />
      }
    >
      <AgentWorkspaceClaimsContent {...props} />
    </Suspense>
  );
}

async function AgentWorkspaceClaimsContent({ params, searchParams }: Readonly<Props>) {
  const { locale } = await params;
  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    redirect(`/${locale}/login`);
  }

  const { session, authority } = authorized;
  const role = session.user.role;
  if (!role) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const selectedClaimId = resolveRequestedClaimId(resolvedSearchParams);

  const result = await getAgentWorkspaceClaimsCore({ authority, selectedClaimId });

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
