import 'server-only';

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
  query?: string;
}): Promise<AgentMembersListReadModel> {
  const { members } = await getAgentMembersList(params);

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
