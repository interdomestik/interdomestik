import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
import { and, claims, desc, eq } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
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
  requestedClaimId?: string | null;
}): Promise<MemberClaimOption[]> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) return [];
  const { authority, session } = admission.authorized;
  const { tenantId } = readTenantAuthority(authority);
  const recentClaims = await withTenantAuthority(authority, tx =>
    tx
      .select(memberClaimOptionSelection)
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.userId, session.user.id)))
      .orderBy(desc(claims.createdAt))
      .limit(10)
  );

  if (!args.requestedClaimId || recentClaims.some(claim => claim.id === args.requestedClaimId)) {
    return recentClaims.map(mapMemberClaimOption);
  }

  const requestedClaimId = args.requestedClaimId;
  const requestedClaims = await withTenantAuthority(authority, tx =>
    tx
      .select(memberClaimOptionSelection)
      .from(claims)
      .where(
        withTenant(
          tenantId,
          claims.tenantId,
          and(eq(claims.userId, session.user.id), eq(claims.id, requestedClaimId))
        )
      )
      .limit(1)
  );

  return [...recentClaims, ...requestedClaims].map(mapMemberClaimOption);
}
