import { and, claimStageHistory, desc, eq, user, withTenantContext } from '@interdomestik/database';
import type { claims } from '@interdomestik/database';
import { parseDiasporaOriginFromPublicNote } from '@interdomestik/domain-claims';

type ClaimHomeReadInput = Pick<typeof claims.$inferSelect, 'agentId' | 'tenantId' | 'userId'>;

export async function readOpsClaimHomeTenantDetails(args: {
  claim: ClaimHomeReadInput;
  claimId: string;
  role?: string | null;
}) {
  return withTenantContext(
    {
      tenantId: args.claim.tenantId,
      role: args.role ?? undefined,
    },
    async tx => {
      const [userData] = await tx
        .select()
        .from(user)
        .where(and(eq(user.id, args.claim.userId), eq(user.tenantId, args.claim.tenantId)))
        .limit(1);

      let agentData: { name: string } | null = null;
      if (args.claim.agentId) {
        const [agent] = await tx
          .select({ name: user.name })
          .from(user)
          .where(and(eq(user.id, args.claim.agentId), eq(user.tenantId, args.claim.tenantId)))
          .limit(1);
        agentData = agent ? { name: agent.name } : null;
      }

      const [diasporaNote] = await tx
        .select({
          note: claimStageHistory.note,
        })
        .from(claimStageHistory)
        .where(
          and(
            eq(claimStageHistory.claimId, args.claimId),
            eq(claimStageHistory.tenantId, args.claim.tenantId)
          )
        )
        .orderBy(desc(claimStageHistory.createdAt), desc(claimStageHistory.id))
        .limit(1);

      return {
        agentData,
        diasporaOrigin: parseDiasporaOriginFromPublicNote(diasporaNote?.note),
        userData: userData ?? null,
      };
    }
  );
}
