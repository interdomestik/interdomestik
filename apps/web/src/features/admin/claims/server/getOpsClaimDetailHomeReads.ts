import {
  and,
  branches,
  claimStageHistory,
  desc,
  eq,
  delegateClaimHomeTenantRead,
  inArray,
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
  'id' | 'agentId' | 'branchId' | 'staffId' | 'tenantId' | 'userId'
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
}) {
  // The home rows are read under the caller's own authority, or its delegation to a transferred
  // claim's home tenant; a claim that is neither yields no home details.
  const homeAuthority = await delegateClaimHomeTenantRead(args.authority, args.claim.id);
  if (!homeAuthority || readTenantAuthority(homeAuthority).tenantId !== args.claim.tenantId) {
    return NO_HOME_DETAILS;
  }

  return withTenantAuthority(homeAuthority, async tx => {
    const { agentId, staffId, tenantId, userId } = args.claim;
    const ids = [...new Set([userId, agentId, staffId].filter((id): id is string => !!id))];
    const people = await tx
      .select({ id: user.id, name: user.name, email: user.email, memberNumber: user.memberNumber })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), inArray(user.id, ids)));
    const byId = new Map(people.map(person => [person.id, person]));
    const userData = byId.get(userId);
    const agentData = agentId ? byId.get(agentId) : null;
    const staffData = staffId ? byId.get(staffId) : null;

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
          eq(claimStageHistory.claimId, args.claim.id),
          eq(claimStageHistory.tenantId, args.claim.tenantId)
        )
      )
      .orderBy(desc(claimStageHistory.createdAt), desc(claimStageHistory.id))
      .limit(1);

    return {
      agentData: agentData ?? null,
      branchData,
      diasporaOrigin: parseDiasporaOriginFromPublicNote(diasporaNote?.note),
      staffData: staffData ?? null,
      userData: userData ?? null,
    };
  });
}
