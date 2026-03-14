import { and, claims, db, desc, eq, ilike, inArray, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull, or, type SQL } from 'drizzle-orm';
import { ACTIONABLE_CLAIM_STATUSES } from '../claims/constants';

export type StaffClaimsAssignmentFilter = 'all' | 'mine' | 'unassigned';

export type StaffClaimsListItem = {
  id: string;
  claimNumber: string | null;
  companyName: string | null;
  title: string | null;
  status: string | null;
  stageLabel: string;
  updatedAt: string | null;
  memberName?: string;
  memberNumber?: string | null;
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

function normalizeSearch(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isActionableStatus(
  value: string | null | undefined
): value is (typeof ACTIONABLE_CLAIM_STATUSES)[number] {
  return !!value && (ACTIONABLE_CLAIM_STATUSES as readonly string[]).includes(value);
}

function buildSearchCondition(term: string) {
  const pattern = `%${term}%`;
  return or(
    ilike(claims.title, pattern),
    ilike(claims.companyName, pattern),
    ilike(claims.claimNumber, pattern),
    ilike(user.name, pattern),
    ilike(user.memberNumber, pattern)
  );
}

export async function getStaffClaimsList(params: {
  staffId: string;
  tenantId: string;
  branchId?: string | null;
  assignment?: StaffClaimsAssignmentFilter;
  limit: number;
  search?: string;
  status?: string;
}): Promise<StaffClaimsListItem[]> {
  const { staffId, tenantId, branchId, assignment = 'all', limit, search, status } = params;
  const conditions: SQL<unknown>[] = [inArray(claims.status, ACTIONABLE_CLAIM_STATUSES)];

  if (branchId != null) {
    conditions.push(eq(claims.branchId, branchId));
  }

  if (assignment === 'mine') {
    conditions.push(eq(claims.staffId, staffId));
  } else if (assignment === 'unassigned') {
    conditions.push(isNull(claims.staffId));
  } else if (branchId == null) {
    const ownOrUnassigned = or(eq(claims.staffId, staffId), isNull(claims.staffId));
    if (ownOrUnassigned) {
      conditions.push(ownOrUnassigned);
    }
  }

  if (isActionableStatus(status)) {
    conditions.push(eq(claims.status, status));
  }

  const searchTerm = normalizeSearch(search);
  if (searchTerm) {
    const searchCondition = buildSearchCondition(searchTerm);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const scopedWhere = withTenant(tenantId, claims.tenantId, and(...conditions));

  const rows = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      companyName: claims.companyName,
      title: claims.title,
      status: claims.status,
      updatedAt: claims.updatedAt,
      memberName: user.name,
      memberNumber: user.memberNumber,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(scopedWhere)
    .orderBy(desc(claims.updatedAt), desc(claims.id))
    .limit(limit);

  return rows.map(row => ({
    id: row.id,
    claimNumber: row.claimNumber,
    companyName: row.companyName,
    title: row.title,
    status: row.status,
    stageLabel: formatStageLabel(row.status),
    updatedAt: normalizeDate(row.updatedAt),
    memberName: row.memberName ?? undefined,
    memberNumber: row.memberNumber ?? null,
  }));
}
