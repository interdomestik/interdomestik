import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';

import type { AgentMemberClaimsDto } from './getAgentMemberClaims';

type AgentMemberRow = { id: string; name: string; email: string };
type AgentMemberClaimRow = {
  id: string;
  title: string;
  status: string | null;
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  userId: string | null;
};

export function mapAgentMemberClaimGroups(
  members: AgentMemberRow[],
  claims: AgentMemberClaimRow[]
): AgentMemberClaimsDto[] {
  return members
    .map(member => ({
      memberId: member.id,
      memberName: member.name,
      memberEmail: member.email,
      claims: claims
        .filter(claim => claim.userId === member.id)
        .map(claim => {
          const { status } = resolveClaimLifecycleReadProjection(claim);
          return {
            id: claim.id,
            title: claim.title,
            status,
            statusLabelKey: `claims-tracking.status.${status}`,
            createdAt: claim.createdAt ?? new Date(),
            updatedAt: claim.updatedAt,
          };
        }),
    }))
    .filter(group => group.claims.length > 0);
}
