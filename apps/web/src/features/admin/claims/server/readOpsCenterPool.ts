// Phase 2.8: Operational Center pool read (runs inside the caller's tenant transaction)
import type { TenantTransaction } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { branches, claims, user } from '@interdomestik/database/schema';
import * as lifecycleSql from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { aliasedTable, and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';

import { isMemberNumberSearch } from '../../members/utils/memberNumber';
import type { RawClaimRow } from '../mappers';
import type { LifecycleStage, OpsCenterFilters } from '../types';
import { OPS_POOL_LIMIT, TERMINAL_STATUSES } from '../types';
import type { ClaimsVisibilityContext } from './claimVisibility';

const LIFECYCLE_STATUS_MAP: Record<LifecycleStage, ClaimStatus[]> = {
  intake: ['draft', 'submitted'],
  verification: ['verification'],
  processing: ['evaluation'],
  negotiation: ['negotiation'],
  legal: ['court'],
  completed: ['resolved', 'rejected'],
};

// ─────────────────────────────────────────────────────────────────────────────
// DB WHERE conditions for pool fetch
// ─────────────────────────────────────────────────────────────────────────────
function buildPoolConditions(
  tx: TenantTransaction,
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters
): SQL[] {
  const { tenantId, role, branchId, userId } = context;
  // Effective access tenant: explicit access tenant wins; home tenant only when access is unset.
  const conditions: SQL[] = [matchesAccessTenant(claims, tenantId)];

  // Role-based scoping
  if (role === 'branch_manager' && branchId) {
    conditions.push(eq(claims.branchId, branchId));
  } else if (role === 'staff') {
    if (branchId) {
      conditions.push(or(eq(claims.branchId, branchId), eq(claims.staffId, userId))!);
    } else {
      conditions.push(eq(claims.staffId, userId));
    }
  }

  // Exclude terminal statuses (ops = open claims only)
  conditions.push(lifecycleSql.claimLifecycleStatusNotIn(TERMINAL_STATUSES));

  // Lifecycle filter (affects KPIs too)
  if (filters.lifecycle) {
    const statuses = LIFECYCLE_STATUS_MAP[filters.lifecycle];
    if (statuses?.length) {
      conditions.push(lifecycleSql.claimLifecycleStatusIn(statuses));
    }
  }

  // Branch filter
  if (filters.branch) {
    conditions.push(eq(branches.code, filters.branch));
  }

  // Pool anchor for stable pagination
  if (filters.poolAnchor) {
    conditions.push(
      sql`(${claims.updatedAt}, ${claims.id}) <= (${filters.poolAnchor.updatedAt}::timestamp, ${filters.poolAnchor.id})`
    );
  }

  // Search filter (Pool Defining)
  // Affects pool fetch and KPIs
  if (filters.search) {
    const term = filters.search.trim().toUpperCase();
    if (term) {
      if (isMemberNumberSearch(term)) {
        // Global Member Number Search (Tenant-Capped)
        // Find users matching the MEM- prefix, then filter claims by those userIds.
        // The subquery is built from the same tenant transaction so it inherits its RLS context.
        const memberSubquery = tx
          .select({ id: user.id })
          .from(user)
          .where(ilike(user.memberNumber, `${term}%`));

        conditions.push(inArray(claims.userId, memberSubquery));
      } else {
        // Standard Claim Search
        conditions.push(
          or(
            eq(claims.claimNumber, term), // Exact match (fastest)
            ilike(claims.claimNumber, `${term}%`), // Prefix match
            ilike(claims.title, `%${term}%`) // Fallback title match
          )!
        );
      }
    }
  }

  return conditions;
}

/**
 * Reads the bounded ops pool inside the caller's tenant transaction.
 * Fetches OPS_POOL_LIMIT + 1 rows so the caller can detect more items. Errors propagate.
 */
export async function readOpsCenterPoolRows(
  tx: TenantTransaction,
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters
): Promise<RawClaimRow[]> {
  const conditions = buildPoolConditions(tx, context, filters);
  const staff = aliasedTable(user, 'staff');
  const agent = aliasedTable(user, 'agent');

  // DB ordering by updatedAt for stability
  const rows = await tx
    .select({
      claim: {
        id: claims.id,
        title: claims.title,
        status: lifecycleSql.claimLifecycleStatusSql(),
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        assignedAt: claims.assignedAt,
        userId: claims.userId, // Added for linking
        claimNumber: claims.claimNumber,
        staffId: claims.staffId, // Critical: needed for isUnassigned computation
        category: claims.category,
        currency: claims.currency,
        statusUpdatedAt: claims.statusUpdatedAt,
        origin: claims.origin,
        originRefId: claims.originRefId,
      },
      claimant: {
        name: user.name,
        email: user.email,
        memberNumber: user.memberNumber,
      },
      staff: {
        name: staff.name,
        email: staff.email,
      },
      branch: {
        id: branches.id,
        code: branches.code,
        name: branches.name,
      },
      agent: {
        name: agent.name,
      },
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .leftJoin(staff, eq(claims.staffId, staff.id))
    .leftJoin(branches, eq(claims.branchId, branches.id))
    .leftJoin(agent, eq(claims.agentId, agent.id)) // Join on agentId (indexed)
    .where(and(...conditions))
    .orderBy(desc(claims.updatedAt), desc(claims.id))
    .limit(OPS_POOL_LIMIT + 1);

  return rows as RawClaimRow[];
}
