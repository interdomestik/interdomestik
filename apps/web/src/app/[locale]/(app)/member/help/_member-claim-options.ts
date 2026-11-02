import { and, claims, desc, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type MemberClaimOption = {
  id: string;
  claimNumber: string | null;
  title: string | null;
  status: string | null;
  createdAt: Date | null;
};

type RawMemberClaimOption = Omit<MemberClaimOption, 'status'> & {
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
};

const memberClaimOptionSelection = {
  id: claims.id,
  claimNumber: claims.claimNumber,
  title: claims.title,
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
  authority: TenantAuthority;
  requestedClaimId?: string | null;
}): Promise<MemberClaimOption[]> {
  const { tenantId } = readTenantAuthority(args.authority);
  const recentClaims = await withTenantAuthority(args.authority, tx =>
    tx
      .select(memberClaimOptionSelection)
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.userId, args.memberId)))
      .orderBy(desc(claims.createdAt))
      .limit(10)
  );

  if (!args.requestedClaimId || recentClaims.some(claim => claim.id === args.requestedClaimId)) {
    return recentClaims.map(mapMemberClaimOption);
  }

  const requestedClaimId = args.requestedClaimId;
  const requestedClaims = await withTenantAuthority(args.authority, tx =>
    tx
      .select(memberClaimOptionSelection)
      .from(claims)
      .where(
        withTenant(
          tenantId,
          claims.tenantId,
          and(eq(claims.userId, args.memberId), eq(claims.id, requestedClaimId))
        )
      )
      .limit(1)
  );

  return [...recentClaims, ...requestedClaims].map(mapMemberClaimOption);
}
