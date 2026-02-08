import { db } from '@interdomestik/database';
import { claims, user } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { desc, eq } from 'drizzle-orm';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

const OPEN_STATUSES = new Set<ClaimStatus>([
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
]);

export type MemberDashboardData = {
  member: {
    id: string;
    name: string;
    membershipNumber: string | null;
  };
  claims: Array<{
    id: string;
    claimNumber: string | null;
    status: ClaimStatus;
    stageKey: string;
    stageLabel: string;
    submittedAt: string | null;
    updatedAt: string | null;
    requiresMemberAction: boolean;
    nextMemberAction?: {
      label: string;
      actionType: 'upload_document' | 'review_offer' | 'provide_info';
      href: string;
    };
  }>;
  activeClaimId: string | null;
  supportHref: string;
};

function formatStageLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getMemberDashboardData(params: {
  memberId: string;
  tenantId?: string | null;
}): Promise<MemberDashboardData> {
  const { memberId, tenantId } = params;

  const memberWhere = tenantId
    ? withTenant(tenantId, user.tenantId, eq(user.id, memberId))
    : eq(user.id, memberId);

  const member = await db.query.user.findFirst({
    where: memberWhere,
    columns: { id: true, name: true, memberNumber: true, tenantId: true },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  const resolvedTenantId = tenantId ?? member.tenantId;
  if (!resolvedTenantId) {
    throw new Error('Missing tenant context');
  }

  const rawClaims = await db.query.claims.findMany({
    where: withTenant(resolvedTenantId, claims.tenantId, eq(claims.userId, memberId)),
    orderBy: [desc(claims.updatedAt)],
    columns: {
      id: true,
      claimNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const claimsData = rawClaims.map(claim => {
    const status = (claim.status || 'draft') as ClaimStatus;
    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      status,
      stageKey: status,
      stageLabel: formatStageLabel(status),
      submittedAt: normalizeDate(claim.createdAt),
      updatedAt: normalizeDate(claim.updatedAt ?? claim.createdAt),
      requiresMemberAction: false,
    };
  });

  claimsData.sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime;
  });

  const activeClaim = claimsData.find(claim => OPEN_STATUSES.has(claim.status));

  return {
    member: {
      id: member.id,
      name: member.name,
      membershipNumber: member.memberNumber ?? null,
    },
    claims: claimsData,
    activeClaimId: activeClaim?.id ?? null,
    supportHref: '/member/help',
  };
}
