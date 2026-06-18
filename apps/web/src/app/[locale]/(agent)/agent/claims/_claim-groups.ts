import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';

import type { AgentMemberClaimsDTO } from './_core';

export function mapAgentMemberClaimGroups(
  members: Record<string, unknown>[],
  memberClaims: Record<string, unknown>[]
): AgentMemberClaimsDTO[] {
  return members
    .map(member => {
      const claims = memberClaims
        .filter(claim => claim.userId === member.id)
        .map(claim => {
          const status = resolveClaimLifecycleReadProjection({
            status: claim.status as string | null,
            caseLifecycleState: claim.caseLifecycleState as string | null,
            recoveryLifecycleState: claim.recoveryLifecycleState as string | null,
          }).status;

          let updatedAt: string | null = null;

          if (claim.updatedAt instanceof Date) {
            updatedAt = claim.updatedAt.toISOString();
          } else if (typeof claim.updatedAt === 'string') {
            updatedAt = claim.updatedAt;
          }

          return {
            id: claim.id as string,
            title: claim.title as string,
            status,
            statusLabelKey: `claims-tracking.status.${status}`,
            createdAt:
              claim.createdAt instanceof Date
                ? claim.createdAt.toISOString()
                : String(claim.createdAt),
            updatedAt,
          };
        });

      return {
        memberId: member.id as string,
        memberName: (member.name as string) || 'Unknown',
        memberEmail: (member.email as string) || 'No email',
        claims,
      };
    })
    .filter(group => group.claims.length > 0);
}
