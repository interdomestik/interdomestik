import {
  and,
  branches,
  claimStageHistory,
  desc,
  eq,
  delegateClaimHomeTenantRead,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { claims } from '@interdomestik/database';
import { parseDiasporaOriginFromPublicNote } from '@interdomestik/domain-claims';

type ClaimHomeReadInput = Pick<
  typeof claims.$inferSelect,
  'agentId' | 'branchId' | 'staffId' | 'tenantId' | 'userId'
>;

const NO_HOME_DETAILS = {
  agentData: null,
  branchData: null,
  diasporaOrigin: parseDiasporaOriginFromPublicNote(undefined),
  staffData: null,
  userData: null,
};

export async function readOpsClaimHomeTenantDetails(args: {
  authority: TenantAuthority;
  claim: ClaimHomeReadInput;
  claimId: string;
}) {
  // The home rows are read under the caller's own authority, or its delegation to a transferred
  // claim's home tenant; a claim that is neither yields no home details.
  const homeAuthority = await delegateClaimHomeTenantRead(args.authority, args.claimId);
  if (!homeAuthority || readTenantAuthority(homeAuthority).tenantId !== args.claim.tenantId) {
    return NO_HOME_DETAILS;
  }

  return withTenantAuthority(homeAuthority, async tx => {
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

    let staffData: { name: string | null; email: string | null } | null = null;
    if (args.claim.staffId) {
      const [staff] = await tx
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(and(eq(user.id, args.claim.staffId), eq(user.tenantId, args.claim.tenantId)))
        .limit(1);
      staffData = staff ?? null;
    }

    let branchData: { id: string | null; code: string | null; name: string | null } | null = null;
    if (args.claim.branchId) {
      const [branch] = await tx
        .select({ id: branches.id, code: branches.code, name: branches.name })
        .from(branches)
        .where(
          and(eq(branches.id, args.claim.branchId), eq(branches.tenantId, args.claim.tenantId))
        )
        .limit(1);
      branchData = branch ?? null;
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
      branchData,
      diasporaOrigin: parseDiasporaOriginFromPublicNote(diasporaNote?.note),
      staffData,
      userData: userData ?? null,
    };
  });
}
