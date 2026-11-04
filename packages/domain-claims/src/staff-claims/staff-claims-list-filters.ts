import { claims, eq, ilike, inArray, user, type TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { isNull, or, type SQL } from 'drizzle-orm';
import { ACTIONABLE_CLAIM_STATUSES } from '../claims/constants';
import {
  buildDiasporaOriginClaimIdsSubqueryIn,
  type DiasporaOriginFilter,
} from '../claims/diaspora-origin-filter';
import { claimLifecycleStatusIn } from '../claims/lifecycle-read-sql';
import { resolveStaffClaimReader } from './reader-policy';

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
  authority: TenantAuthority;
  tx: TenantTransaction;
  assignment: StaffClaimsAssignmentFilter;
  diasporaOrigin: DiasporaOriginFilter;
  search?: string;
  status?: string;
}): SQL<unknown>[] {
  // Scope comes only from the authority; a caller cannot hand the builder another reader.
  const reader = resolveStaffClaimReader(params.authority);
  if (!reader) throw new Error('The tenant authority grants no staff claim reader');
  const { branchId, role, staffId } = reader;
  const conditions: SQL<unknown>[] = [claimLifecycleStatusIn(ACTIONABLE_CLAIM_STATUSES)];

  if (branchId != null) {
    conditions.push(eq(claims.branchId, branchId));
  }

  const shouldUseFallback = role !== 'branch_manager' || branchId == null;

  if (params.assignment === 'mine') {
    conditions.push(eq(claims.staffId, staffId));
  } else if (params.assignment === 'unassigned') {
    conditions.push(isNull(claims.staffId));
  } else if (shouldUseFallback) {
    const ownOrUnassigned = or(eq(claims.staffId, staffId), isNull(claims.staffId));
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
    conditions.push(
      inArray(claims.id, buildDiasporaOriginClaimIdsSubqueryIn(params.tx, params.authority))
    );
  }

  return conditions;
}
