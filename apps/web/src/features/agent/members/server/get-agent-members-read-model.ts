import 'server-only';
import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';

import { getAgentMembersList } from '@interdomestik/domain-agent';

export type AgentMembersListReadModel = {
  members: Array<{
    memberId: string;
    name: string;
    memberNumber: string | null;
    openClaimsCount: number;
    attentionState: 'needs_attention' | 'up_to_date';
  }>;
};

export async function getAgentMembersListReadModel(params: {
  agentId: string;
  tenantId: string;
  role: string | null;
  query?: string;
}): Promise<AgentMembersListReadModel> {
  const authority = await authorizeSessionUserTenant(params.agentId);
  if (!authority) throw new Error('Forbidden: agent session required');
  const { tenantId, principal } = readTenantAuthority(authority);
  if (tenantId !== params.tenantId || principal?.role !== params.role)
    throw new Error('Forbidden: agent account changed');
  const { members } = await getAgentMembersList({ ...params, authority });

  return {
    members: members.map(member => ({
      memberId: member.memberId,
      name: member.name,
      memberNumber: member.membershipNumber,
      openClaimsCount: member.openClaimsCount,
      attentionState: member.attentionState,
    })),
  };
}
