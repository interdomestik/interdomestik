import { getAgentMembersListReadModel } from '@/features/agent/members/server/get-agent-members-read-model';
import { ensureTenantId } from '@interdomestik/shared-auth';

type AgentMembersSearchParams = {
  q?: string;
};

type AgentMembersSession = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
    accessTenantId?: string | null;
  };
};

export async function getAgentMembersPageData({
  searchParams,
  session,
}: {
  searchParams?: AgentMembersSearchParams;
  session: AgentMembersSession;
}) {
  const rawSearch = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const search = rawSearch.trim() || undefined;

  // Effective access tenant and the actual verified role travel to the tenant transaction.
  const { members } = await getAgentMembersListReadModel({
    agentId: session.user.id,
    tenantId: ensureTenantId(session),
    role: session.user.role ?? null,
    query: search,
  });

  const attentionCount = members.filter(
    member => member.attentionState === 'needs_attention'
  ).length;
  const openClaimsTotal = members.reduce((sum, member) => sum + member.openClaimsCount, 0);

  return {
    attentionCount,
    members,
    openClaimsTotal,
    search,
  };
}
