// Phase 2.8: Operational Center pool reads (run inside the caller's access-tenant transaction)
import type { TenantTransaction } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { branches, claims, user } from '@interdomestik/database/schema';
import * as lifecycleSql from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';

import { isMemberNumberSearch } from '../../members/utils/memberNumber';
import type { RawClaimRow } from '../mappers';
import type { LifecycleStage, OpsCenterFilters, OpsPoolAnchor } from '../types';
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

/** Keyset page size for the transferred-candidate scan (bounds memory and bind params). */
export const TRANSFERRED_SCAN_PAGE_SIZE = 500;

/** Internal home-tenant references of a pool row; stripped before the row reaches the mapper. */
export interface OpsPoolHomeRefs {
  tenantId: string;
  branchId: string | null;
  agentId: string | null;
}

export type OpsCenterPoolRow = RawClaimRow & { home: OpsPoolHomeRefs };

/** Pool-defining filters evaluated on claim references (branch code, member number). */
export interface OpsPoolRefFilter {
  branchCode: string | null;
  memberTerm: string | null;
}

/** Access-admitted claim whose home tenant differs from the access tenant. */
export interface TransferredCandidate {
  id: string;
  tenantId: string;
  branchId: string | null;
  userId: string;
  localBranchMatch: boolean;
  localMemberMatch: boolean;
}

type PoolSearch = { kind: 'member' | 'claim'; term: string };

function parsePoolSearch(search: string | undefined): PoolSearch | null {
  const term = search?.trim().toUpperCase();
  if (!term) return null;
  return { kind: isMemberNumberSearch(term) ? 'member' : 'claim', term };
}

export function resolvePoolRefFilter(filters: OpsCenterFilters): OpsPoolRefFilter | null {
  const search = parsePoolSearch(filters.search);
  const branchCode = filters.branch?.length ? filters.branch : null;
  const memberTerm = search?.kind === 'member' ? search.term : null;
  return branchCode || memberTerm ? { branchCode, memberTerm } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB WHERE conditions for pool fetch
// ─────────────────────────────────────────────────────────────────────────────
function roleScopeCondition(context: ClaimsVisibilityContext): SQL | undefined {
  const { role, branchId, userId } = context;
  if (role === 'branch_manager' && branchId) {
    return eq(claims.branchId, branchId);
  }
  if (role !== 'staff') return undefined;
  return branchId
    ? or(eq(claims.branchId, branchId), eq(claims.staffId, userId))
    : eq(claims.staffId, userId);
}

// Lifecycle filter (affects KPIs too)
function lifecycleCondition(lifecycle: LifecycleStage | undefined): SQL | undefined {
  const statuses = lifecycle ? LIFECYCLE_STATUS_MAP[lifecycle] : undefined;
  return statuses?.length ? lifecycleSql.claimLifecycleStatusIn(statuses) : undefined;
}

// Pool anchor for stable pagination
function poolAnchorCondition(anchor: OpsPoolAnchor | undefined): SQL | undefined {
  if (!anchor) return undefined;
  return sql`(${claims.updatedAt}, ${claims.id}) <= (${anchor.updatedAt}::timestamp, ${anchor.id})`;
}

// Standard Claim Search
function claimSearchCondition(term: string): SQL | undefined {
  return or(
    eq(claims.claimNumber, term), // Exact match (fastest)
    ilike(claims.claimNumber, `${term}%`), // Prefix match
    ilike(claims.title, `%${term}%`) // Fallback title match
  );
}

/** Claim-column conditions shared by the pool, the transferred scan and the match ranking. */
function buildClaimConditions(context: ClaimsVisibilityContext, filters: OpsCenterFilters): SQL[] {
  const search = parsePoolSearch(filters.search);
  return [
    // Effective access tenant: explicit access tenant wins; home tenant only when access is unset.
    matchesAccessTenant(claims, context.tenantId),
    roleScopeCondition(context),
    // Exclude terminal statuses (ops = open claims only)
    lifecycleSql.claimLifecycleStatusNotIn(TERMINAL_STATUSES),
    lifecycleCondition(filters.lifecycle),
    poolAnchorCondition(filters.poolAnchor),
    search?.kind === 'claim' ? claimSearchCondition(search.term) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);
}

// Branch + member-number filters (Pool Defining) on access-tenant visible references.
function localRefConditions(tx: TenantTransaction, refFilter: OpsPoolRefFilter | null): SQL[] {
  const conditions: SQL[] = [];
  if (refFilter?.branchCode) {
    conditions.push(eq(branches.code, refFilter.branchCode));
  }
  if (refFilter?.memberTerm) {
    // Global Member Number Search (Tenant-Capped)
    // Find users matching the MEM- prefix, then filter claims by those userIds.
    // The subquery is built from the same tenant transaction so it inherits its RLS context.
    const memberSubquery = tx
      .select({ id: user.id })
      .from(user)
      .where(ilike(user.memberNumber, `${refFilter.memberTerm}%`));
    conditions.push(inArray(claims.userId, memberSubquery));
  }
  return conditions;
}

// Transferred claims whose home references matched are admitted by id, before the pool cap.
function refFilterCondition(
  tx: TenantTransaction,
  refFilter: OpsPoolRefFilter | null,
  transferredMatchIds: string[]
): SQL | undefined {
  const localMatch = and(...localRefConditions(tx, refFilter));
  if (!localMatch || transferredMatchIds.length === 0) return localMatch;
  return or(localMatch, inArray(claims.id, transferredMatchIds));
}

function localMatchSql(condition: SQL | undefined): SQL<boolean> {
  const fallbackCondition = condition ?? sql`false`;
  return sql<boolean>`coalesce(${fallbackCondition}, false)`;
}

/**
 * Reads one keyset page of access-admitted transferred claims (home tenant differs from the
 * access tenant) with their reference ids and the access-tenant reference matches.
 */
export async function readTransferredCandidatePage(
  tx: TenantTransaction,
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters,
  refFilter: OpsPoolRefFilter,
  cursor: string | null
): Promise<TransferredCandidate[]> {
  const branchMatch = refFilter.branchCode ? eq(branches.code, refFilter.branchCode) : undefined;
  const memberMatch = refFilter.memberTerm
    ? ilike(user.memberNumber, `${refFilter.memberTerm}%`)
    : undefined;

  return await tx
    .select({
      id: claims.id,
      tenantId: claims.tenantId,
      branchId: claims.branchId,
      userId: claims.userId,
      localBranchMatch: localMatchSql(branchMatch),
      localMemberMatch: localMatchSql(memberMatch),
    })
    .from(claims)
    .leftJoin(branches, eq(claims.branchId, branches.id))
    .leftJoin(user, eq(claims.userId, user.id))
    .where(
      and(
        ...buildClaimConditions(context, filters),
        ne(claims.tenantId, context.tenantId),
        cursor ? gt(claims.id, cursor) : undefined
      )
    )
    .orderBy(asc(claims.id))
    .limit(TRANSFERRED_SCAN_PAGE_SIZE);
}

/**
 * Keeps the newest OPS_POOL_LIMIT + 1 transferred matches in pool order, so accumulated
 * matches stay bounded while the global top of the pool is preserved.
 */
export async function rankTransferredMatches(
  tx: TenantTransaction,
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters,
  matchIds: string[]
): Promise<string[]> {
  if (matchIds.length <= OPS_POOL_LIMIT + 1) return matchIds;
  const rows = await tx
    .select({ id: claims.id })
    .from(claims)
    .where(and(...buildClaimConditions(context, filters), inArray(claims.id, matchIds)))
    .orderBy(desc(claims.updatedAt), desc(claims.id))
    .limit(OPS_POOL_LIMIT + 1);
  return rows.map(row => row.id);
}

/**
 * Reads the bounded ops pool inside the caller's tenant transaction.
 * Fetches OPS_POOL_LIMIT + 1 rows so the caller can detect more items. Errors propagate.
 */
export async function readOpsCenterPoolRows(
  tx: TenantTransaction,
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters,
  transferredMatchIds: string[] = []
): Promise<OpsCenterPoolRow[]> {
  const conditions = [
    ...buildClaimConditions(context, filters),
    refFilterCondition(tx, resolvePoolRefFilter(filters), transferredMatchIds),
  ];
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
      // Internal only: home tenant and reference ids for the NULL-only home fallback.
      home: {
        tenantId: claims.tenantId,
        branchId: claims.branchId,
        agentId: claims.agentId,
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

  return rows as OpsCenterPoolRow[];
}
