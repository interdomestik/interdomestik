import { and, claims, db, desc, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';

export type MemberClaimOption = {
  id: string;
  claimNumber: string | null;
  title: string | null;
  status: string | null;
  createdAt: Date | null;
};

type RawMemberClaimOption = MemberClaimOption & {
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
};

const memberClaimOptionSelection = {
  id: claims.id,
  claimNumber: claims.claimNumber,
  title: claims.title,
  status: claims.status,
  caseLifecycleState: claims.caseLifecycleState,
  recoveryLifecycleState: claims.recoveryLifecycleState,
  createdAt: claims.createdAt,
};

function mapMemberClaimOption(claim: RawMemberClaimOption): MemberClaimOption {
  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    title: claim.title,
    status: resolveClaimLifecycleReadProjection(claim).status,
    createdAt: claim.createdAt,
  };
}

export async function getMemberClaimOptions(args: {
  memberId: string;
  tenantId: string;
  requestedClaimId?: string | null;
}): Promise<MemberClaimOption[]> {
  const recentClaims = await db
    .select(memberClaimOptionSelection)
    .from(claims)
    .where(withTenant(args.tenantId, claims.tenantId, eq(claims.userId, args.memberId)))
    .orderBy(desc(claims.createdAt))
    .limit(10);

  if (!args.requestedClaimId || recentClaims.some(claim => claim.id === args.requestedClaimId)) {
    return recentClaims.map(mapMemberClaimOption);
  }

  const requestedClaims = await db
    .select(memberClaimOptionSelection)
    .from(claims)
    .where(
      withTenant(
        args.tenantId,
        claims.tenantId,
        and(eq(claims.userId, args.memberId), eq(claims.id, args.requestedClaimId))
      )
    )
    .limit(1);

  return [...recentClaims, ...requestedClaims].map(mapMemberClaimOption);
}
