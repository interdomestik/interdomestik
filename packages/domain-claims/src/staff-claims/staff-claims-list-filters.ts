import { claims, eq, ilike, inArray, user } from '@interdomestik/database';
import { isNull, or, type SQL } from 'drizzle-orm';
import { ACTIONABLE_CLAIM_STATUSES } from '../claims/constants';
import {
  buildDiasporaOriginClaimIdsSubquery,
  type DiasporaOriginFilter,
} from '../claims/diaspora-origin-filter';
import { claimLifecycleStatusIn } from '../claims/lifecycle-read-sql';

export type StaffClaimsAssignmentFilter = 'all' | 'mine' | 'unassigned';

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

export function buildStaffClaimsListConditions(params: {
  assignment: StaffClaimsAssignmentFilter;
  branchId?: string | null;
  diasporaOrigin: DiasporaOriginFilter;
  search?: string;
  staffId: string;
  status?: string;
  tenantId: string;
  viewerRole?: string | null;
}): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [claimLifecycleStatusIn(ACTIONABLE_CLAIM_STATUSES)];

  if (params.branchId != null) {
    conditions.push(eq(claims.branchId, params.branchId));
  }

  const shouldUseFallback =
    params.viewerRole !== 'branch_manager' ||
    (params.viewerRole === 'branch_manager' && params.branchId == null);

  if (params.assignment === 'mine') {
    conditions.push(eq(claims.staffId, params.staffId));
  } else if (params.assignment === 'unassigned') {
    conditions.push(isNull(claims.staffId));
  } else if (shouldUseFallback) {
    const ownOrUnassigned = or(eq(claims.staffId, params.staffId), isNull(claims.staffId));
    if (ownOrUnassigned) conditions.push(ownOrUnassigned);
  }

  if (isActionableStatus(params.status)) {
    conditions.push(claimLifecycleStatusIn([params.status]));
  }

  const searchTerm = normalizeSearch(params.search);
  if (searchTerm) {
    const searchCondition = buildSearchCondition(searchTerm);
    if (searchCondition) conditions.push(searchCondition);
  }

  if (params.diasporaOrigin === 'diaspora') {
    conditions.push(inArray(claims.id, buildDiasporaOriginClaimIdsSubquery(params.tenantId)));
  }

  return conditions;
}
