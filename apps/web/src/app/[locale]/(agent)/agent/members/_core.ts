import { getAgentMembersListReadModel } from '@/features/agent/members/server/get-agent-members-read-model';

type AgentMembersSearchParams = {
  q?: string;
};

type AgentMembersSession = {
  user: {
    id: string;
    tenantId: string;
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

  const { members } = await getAgentMembersListReadModel({
    agentId: session.user.id,
    tenantId: session.user.tenantId,
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
