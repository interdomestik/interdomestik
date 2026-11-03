import { and, asc, eq, or } from 'drizzle-orm';
import { dbAdmin } from './db';
import { branches } from './schema/rbac';
import { tenants } from './schema/tenants';
import {
  mintTenantAuthority,
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from './tenant-authority';

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

// Super-admin producers. The actor proof is the super admin's own request-session authority (or a
// test authority under a test runner); its principal must carry the super_admin role. The minted
// authority keeps that principal, so the target tenant's role context is the super admin's, and
// it is scoped to exactly one target tenant.

export type DelegatedTenantWork = Readonly<{ tenantId: string; authority: TenantAuthority }>;
export type DelegatedBranchOwner = Readonly<{
  branchId: string;
  tenantId: string;
  authority: TenantAuthority;
}>;

const ACTOR_PURPOSES = new Set(['session', 'test']);

function requireSuperAdminActor(actor: TenantAuthority): TenantAuthorityPrincipal {
  const descriptor = readTenantAuthority(actor);
  if (!ACTOR_PURPOSES.has(descriptor.purpose) || descriptor.principal?.role !== 'super_admin') {
    throw new Error('Super-admin tenant delegation requires a super_admin session authority');
  }
  return descriptor.principal;
}

function mintDelegated(
  principal: TenantAuthorityPrincipal,
  tenantId: string,
  purpose: 'platform-aggregate' | 'super-admin-delegation'
): TenantAuthority {
  return mintTenantAuthority({ tenantId, purpose, principal });
}

/** One platform-aggregate authority per tenant, for a super_admin's cross-tenant totals. */
export async function listSuperAdminAggregateWork(
  actor: TenantAuthority
): Promise<DelegatedTenantWork[]> {
  const principal = requireSuperAdminActor(actor);
  const tenantIds = await listTenantIdsForPlatformAggregate();
  return tenantIds.map(tenantId =>
    Object.freeze({ tenantId, authority: mintDelegated(principal, tenantId, 'platform-aggregate') })
  );
}

/** A super_admin acting on one named, active tenant. Unknown or inactive tenants yield null. */
export async function delegateSuperAdminTenant(
  actor: TenantAuthority,
  tenantId: string
): Promise<TenantAuthority | null> {
  const principal = requireSuperAdminActor(actor);
  const activeTenantId = await readActiveTenantId(tenantId);
  return activeTenantId ? mintDelegated(principal, activeTenantId, 'super-admin-delegation') : null;
}

/** A super_admin's cross-tenant branch view: the branch's owning tenant, scoped to that tenant. */
export async function delegateSuperAdminBranchOwner(
  actor: TenantAuthority,
  idOrCode: string
): Promise<DelegatedBranchOwner | null> {
  const principal = requireSuperAdminActor(actor);
  const owner = await resolveBranchOwner(idOrCode);
  if (!owner) return null;
  return Object.freeze({
    ...owner,
    authority: mintDelegated(principal, owner.tenantId, 'super-admin-delegation'),
  });
}

export type SuperAdminTenantOption = Readonly<{
  id: string;
  name: string;
  countryCode: string;
}>;

/**
 * The super-admin tenant selector: active tenants' id, display name and country only, ordered by
 * name. Requires a super_admin session authority; returns no member, case or configuration data.
 */
export async function listSuperAdminTenantOptions(
  actor: TenantAuthority
): Promise<SuperAdminTenantOption[]> {
  requireSuperAdminActor(actor);
  // db-access-guard: system-exempt -- reason: super-admin selector projection of active tenant id, name and country only
  const rows = await dbAdmin
    .select({ id: tenants.id, name: tenants.name, countryCode: tenants.countryCode })
    .from(tenants)
    .where(eq(tenants.isActive, true))
    .orderBy(asc(tenants.name))
    .limit(MAX_PLATFORM_TENANTS + 1);
  if (rows.length > MAX_PLATFORM_TENANTS) {
    throw new Error(`Platform aggregate exceeds ${MAX_PLATFORM_TENANTS} tenants`);
  }
  return rows.map(row => Object.freeze({ ...row }));
}

/**
 * Public platform statistics have no actor: one principal-less aggregate authority per tenant.
 * Callers return totals only. The db-access guard pins this producer's callers.
 */
export async function listPublicStatisticsWork(): Promise<DelegatedTenantWork[]> {
  const tenantIds = await listTenantIdsForPlatformAggregate();
  return tenantIds.map(tenantId =>
    Object.freeze({
      tenantId,
      authority: mintTenantAuthority({ tenantId, purpose: 'platform-aggregate' }),
    })
  );
}
