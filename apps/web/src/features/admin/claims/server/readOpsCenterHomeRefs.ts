// Phase 2.8: Home-tenant reference reads for transferred ops claims.
// Home tenants and reference ids come only from claims already admitted in the access tenant.
import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import { branches, user } from '@interdomestik/database/schema';
import { and, eq, ilike, inArray } from 'drizzle-orm';

import type { RawClaimRow } from '../mappers';
import type { ClaimsVisibilityContext } from './claimVisibility';
import type { OpsCenterPoolRow, OpsPoolRefFilter, TransferredCandidate } from './readOpsCenterPool';

interface HomeUser {
  id: string;
  name: string | null;
  email: string | null;
  memberNumber: string | null;
}

interface HomeBranch {
  id: string;
  code: string | null;
  name: string | null;
}

interface HomeRefIds {
  userIds: Set<string>;
  branchIds: Set<string>;
}

interface HomeRefRows {
  users: Map<string, HomeUser>;
  branches: Map<string, HomeBranch>;
}

interface HomeRefMatches {
  branchIds: Set<string>;
  userIds: Set<string>;
}

// Actual actor role; only the tenant is the claim's home tenant.
function homeContext(context: ClaimsVisibilityContext, homeTenantId: string) {
  return { tenantId: homeTenantId, role: context.role };
}

function uniqueIds(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function isMissing(value: object | null | undefined): boolean {
  return !value || Object.values(value).every(field => field === null || field === undefined);
}

function groupByHomeTenant(
  candidates: TransferredCandidate[]
): Map<string, TransferredCandidate[]> {
  const groups = new Map<string, TransferredCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.tenantId) ?? [];
    group.push(candidate);
    groups.set(candidate.tenantId, group);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool-defining reference filters for transferred candidates
// ─────────────────────────────────────────────────────────────────────────────
async function readMatchingHomeBranchIds(
  tx: TenantTransaction,
  homeTenantId: string,
  branchIds: string[],
  branchCode: string | null
): Promise<Set<string>> {
  if (!branchCode || branchIds.length === 0) return new Set();
  const rows = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.tenantId, homeTenantId),
        inArray(branches.id, branchIds),
        eq(branches.code, branchCode)
      )
    );
  return new Set(rows.map(row => row.id));
}

async function readMatchingHomeUserIds(
  tx: TenantTransaction,
  homeTenantId: string,
  userIds: string[],
  memberTerm: string | null
): Promise<Set<string>> {
  if (!memberTerm || userIds.length === 0) return new Set();
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.tenantId, homeTenantId),
        inArray(user.id, userIds),
        ilike(user.memberNumber, `${memberTerm}%`)
      )
    );
  return new Set(rows.map(row => row.id));
}

async function readHomeRefMatches(
  context: ClaimsVisibilityContext,
  homeTenantId: string,
  refFilter: OpsPoolRefFilter,
  group: TransferredCandidate[]
): Promise<HomeRefMatches> {
  // Only references the access tenant could not match are checked in the home tenant.
  const branchIds = refFilter.branchCode
    ? uniqueIds(group.filter(c => !c.localBranchMatch).map(c => c.branchId))
    : [];
  const userIds = refFilter.memberTerm
    ? uniqueIds(group.filter(c => !c.localMemberMatch).map(c => c.userId))
    : [];
  if (branchIds.length === 0 && userIds.length === 0) {
    return { branchIds: new Set(), userIds: new Set() };
  }

  return await withTenantContext(homeContext(context, homeTenantId), async tx => ({
    branchIds: await readMatchingHomeBranchIds(tx, homeTenantId, branchIds, refFilter.branchCode),
    userIds: await readMatchingHomeUserIds(tx, homeTenantId, userIds, refFilter.memberTerm),
  }));
}

function matchesRefFilter(
  candidate: TransferredCandidate,
  refFilter: OpsPoolRefFilter,
  home: HomeRefMatches
): boolean {
  const branchMatches =
    !refFilter.branchCode ||
    candidate.localBranchMatch ||
    (candidate.branchId !== null && home.branchIds.has(candidate.branchId));
  const memberMatches =
    !refFilter.memberTerm || candidate.localMemberMatch || home.userIds.has(candidate.userId);
  return branchMatches && memberMatches;
}

/**
 * Returns the ids of transferred candidates matching every active reference filter, using
 * one sequential home-tenant transaction per distinct home tenant. Errors propagate.
 */
export async function matchHomeRefFilter(
  context: ClaimsVisibilityContext,
  refFilter: OpsPoolRefFilter,
  candidates: TransferredCandidate[]
): Promise<string[]> {
  const matched: string[] = [];
  for (const [homeTenantId, group] of groupByHomeTenant(candidates)) {
    const home = await readHomeRefMatches(context, homeTenantId, refFilter, group);
    for (const candidate of group) {
      if (matchesRefFilter(candidate, refFilter, home)) matched.push(candidate.id);
    }
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────────
// NULL-only home fallback for transferred pool rows
// ─────────────────────────────────────────────────────────────────────────────
function missingHomeUserIds(row: OpsCenterPoolRow): string[] {
  return uniqueIds([
    isMissing(row.claimant) ? row.claim.userId : null,
    isMissing(row.staff) ? row.claim.staffId : null,
    isMissing(row.agent) ? row.home.agentId : null,
  ]);
}

function collectMissingHomeRefs(
  rows: OpsCenterPoolRow[],
  accessTenantId: string
): Map<string, HomeRefIds> {
  const byHome = new Map<string, HomeRefIds>();
  for (const row of rows) {
    if (row.home.tenantId === accessTenantId) continue;
    const userIds = missingHomeUserIds(row);
    const branchId = isMissing(row.branch) ? row.home.branchId : null;
    if (userIds.length === 0 && !branchId) continue;

    const refs = byHome.get(row.home.tenantId) ?? { userIds: new Set(), branchIds: new Set() };
    userIds.forEach(id => refs.userIds.add(id));
    if (branchId) refs.branchIds.add(branchId);
    byHome.set(row.home.tenantId, refs);
  }
  return byHome;
}

async function readHomeRefRows(
  tx: TenantTransaction,
  homeTenantId: string,
  refs: HomeRefIds
): Promise<HomeRefRows> {
  const users: HomeUser[] =
    refs.userIds.size === 0
      ? []
      : await tx
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            memberNumber: user.memberNumber,
          })
          .from(user)
          .where(and(eq(user.tenantId, homeTenantId), inArray(user.id, [...refs.userIds])));
  const branchRows: HomeBranch[] =
    refs.branchIds.size === 0
      ? []
      : await tx
          .select({ id: branches.id, code: branches.code, name: branches.name })
          .from(branches)
          .where(
            and(eq(branches.tenantId, homeTenantId), inArray(branches.id, [...refs.branchIds]))
          );
  return {
    users: new Map(users.map(row => [row.id, row] as const)),
    branches: new Map(branchRows.map(row => [row.id, row] as const)),
  };
}

function withNullFallback<J extends object | null | undefined>(
  joined: J,
  home: NonNullable<J> | undefined
): J | NonNullable<J> {
  return isMissing(joined) && home ? home : joined;
}

function applyHomeRefs(
  { home, ...row }: OpsCenterPoolRow,
  refs: HomeRefRows | undefined
): RawClaimRow {
  if (!refs) return row;
  const claimant = refs.users.get(row.claim.userId);
  const staff = row.claim.staffId ? refs.users.get(row.claim.staffId) : undefined;
  const agent = home.agentId ? refs.users.get(home.agentId) : undefined;
  const branch = home.branchId ? refs.branches.get(home.branchId) : undefined;
  return {
    ...row,
    claimant: withNullFallback(
      row.claimant,
      claimant && {
        name: claimant.name,
        email: claimant.email,
        memberNumber: claimant.memberNumber,
      }
    ),
    staff: withNullFallback(row.staff, staff && { name: staff.name, email: staff.email }),
    branch: withNullFallback(
      row.branch,
      branch && { id: branch.id, code: branch.code, name: branch.name }
    ),
    agent: withNullFallback(row.agent, agent && { name: agent.name }),
  };
}

/**
 * Fills missing references of transferred pool rows from their home tenant (batched per home
 * tenant, sequential transactions) and strips the internal home projection. Errors propagate.
 */
export async function enrichHomeTenantRefs(
  context: ClaimsVisibilityContext,
  rows: OpsCenterPoolRow[]
): Promise<RawClaimRow[]> {
  const resolved = new Map<string, HomeRefRows>();
  for (const [homeTenantId, refs] of collectMissingHomeRefs(rows, context.tenantId)) {
    resolved.set(
      homeTenantId,
      await withTenantContext(homeContext(context, homeTenantId), tx =>
        readHomeRefRows(tx, homeTenantId, refs)
      )
    );
  }
  return rows.map(row => applyHomeRefs(row, resolved.get(row.home.tenantId)));
}
