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
  const { principal } = readTenantAuthority(authority);
  if (!principal) throw new Error('Forbidden: agent members list requires a session principal');
  const rawSearch = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const search = rawSearch.trim() || undefined;

  // The session capability carries the effective tenant and verified role to the transaction.
  const { members } = await getAgentMembersListReadModel({
    agentId: principal.userId,
    authority,
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
