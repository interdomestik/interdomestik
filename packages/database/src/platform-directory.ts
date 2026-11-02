import { and, asc, eq, or } from 'drizzle-orm';
import { dbAdmin } from './db';
import { branches } from './schema/rbac';
import { tenants } from './schema/tenants';

/** Upper bound on tenants a platform aggregate visits; exceeding it fails closed. */
export const MAX_PLATFORM_TENANTS = 500;

export type BranchOwner = { branchId: string; tenantId: string };

// Platform-level reads that precede any tenant context: the tenant directory is deny-all to
// runtime roles. These fixed projections return identifiers only, never directory, member or case
// data. Callers authorize the actor (super_admin, or a public aggregate with no actor
// input) before calling, and read every row of tenant data inside withTenantContext.

/**
 * Tenant ids for a platform aggregate (public statistics, super-admin KPIs). Callers compute each
 * figure per tenant under RLS and return only totals; the id list itself is never returned.
 */
export async function listTenantIdsForPlatformAggregate(): Promise<string[]> {
  // db-access-guard: system-exempt -- reason: platform aggregate tenant id enumeration only; every figure is computed per tenant under RLS
  const rows = await dbAdmin
    .select({ id: tenants.id })
    .from(tenants)
    .orderBy(asc(tenants.id))
    .limit(MAX_PLATFORM_TENANTS + 1);
  if (rows.length > MAX_PLATFORM_TENANTS) {
    throw new Error(`Platform aggregate exceeds ${MAX_PLATFORM_TENANTS} tenants`);
  }
  return rows.map(row => row.id);
}

/** Exact active-tenant check for a tenant id the caller has already authorized the actor to name. */
export async function readActiveTenantId(tenantId: string): Promise<string | null> {
  const normalized = tenantId.trim();
  if (!normalized) return null;
  // db-access-guard: system-exempt -- reason: exact active tenant existence check; returns the id only
  const rows = await dbAdmin
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, normalized), eq(tenants.isActive, true)))
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}

/**
 * Owning tenant of one branch named by id or code, for a super-admin cross-tenant branch view.
 * Branch codes are unique per tenant only, so a code shared by several tenants is ambiguous and
 * resolves to nothing. Callers re-read the branch inside the owner's tenant context.
 */
export async function resolveBranchOwner(idOrCode: string): Promise<BranchOwner | null> {
  const normalized = idOrCode.trim();
  if (!normalized) return null;
  // db-access-guard: system-exempt -- reason: exact branch id/code to owning tenant id; ambiguity resolves to nothing
  const rows = await dbAdmin
    .select({ branchId: branches.id, tenantId: branches.tenantId })
    .from(branches)
    .where(or(eq(branches.id, normalized), eq(branches.code, normalized)))
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}
