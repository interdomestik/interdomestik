import { getAgentMembersListReadModel } from '@/features/agent/members/server/get-agent-members-read-model';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

type AgentMembersSearchParams = {
  q?: string;
};

export async function getAgentMembersPageData({
  searchParams,
  authority,
}: {
  searchParams?: AgentMembersSearchParams;
  authority: TenantAuthority;
}) {
  const { tenantId, principal } = readTenantAuthority(authority);
  if (!principal) throw new Error('Forbidden: agent members list requires a session principal');
  const rawSearch = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const search = rawSearch.trim() || undefined;

  // The read model re-authorizes the session and must see the same tenant and verified role.
  const { members } = await getAgentMembersListReadModel({
    agentId: principal.userId,
    tenantId,
    role: principal.role,
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
