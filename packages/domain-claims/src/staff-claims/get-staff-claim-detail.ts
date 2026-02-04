import { and, claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

export type StaffClaimDetail = {
  claim: {
    id: string;
    claimNumber: string | null;
    status: string | null;
    stageLabel: string;
    submittedAt: string | null;
    updatedAt: string | null;
  };
  member: {
    id: string;
    fullName: string;
    membershipNumber: string | null;
  };
  agent?: {
    id: string;
    name: string;
  };
};

function formatStageLabel(status: string | null | undefined) {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getStaffClaimDetail(params: {
  staffId: string;
  tenantId: string;
  claimId: string;
}): Promise<StaffClaimDetail | null> {
  const { tenantId, claimId } = params;

  const rows = await db
    .select({
      claimId: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
      updatedAt: claims.updatedAt,
      createdAt: claims.createdAt,
      agentId: claims.agentId,
      memberId: user.id,
      memberName: user.name,
      memberNumber: user.memberNumber,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(withTenant(tenantId, claims.tenantId, and(eq(claims.id, claimId))))
    .limit(1);

  const row = rows[0];
  if (!row || !row.memberId || !row.memberName) return null;

  let agent: StaffClaimDetail['agent'];
  if (row.agentId) {
    const agentRows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(withTenant(tenantId, user.tenantId, eq(user.id, row.agentId)))
      .limit(1);
    const agentRow = agentRows[0];
    if (agentRow?.id && agentRow.name) {
      agent = { id: agentRow.id, name: agentRow.name };
    }
  }

  return {
    claim: {
      id: row.claimId,
      claimNumber: row.claimNumber,
      status: row.status,
      stageLabel: formatStageLabel(row.status),
      submittedAt: normalizeDate(row.createdAt),
      updatedAt: normalizeDate(row.updatedAt ?? row.createdAt),
    },
    member: {
      id: row.memberId,
      fullName: row.memberName,
      membershipNumber: row.memberNumber ?? null,
    },
    agent,
  };
}
