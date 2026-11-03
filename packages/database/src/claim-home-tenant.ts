import { and, eq, or } from 'drizzle-orm';
import { dbAdmin } from './db';
import { claims } from './schema/claims';
import { mintTenantAuthority, readTenantAuthority, type TenantAuthority } from './tenant-authority';

// A claim transferred to another tenant's operations keeps its claimant, agent, staff, branch and
// stage history in its home tenant. An operator of the access tenant may read those home rows for
// that one claim. This producer confirms the claim is the caller's (home or access tenant) and
// delegates the caller's own principal to the home tenant for a short read. The tenant guard names
// the only module allowed to call it, whose fixed reads cover that claim alone.

/**
 * The authority for reading a claim's home-tenant details: the caller's own when the claim is homed
 * in its tenant, a short home-tenant delegation when the claim was transferred to it, otherwise null.
 */
export async function delegateClaimHomeTenantRead(
  authority: TenantAuthority,
  claimId: string
): Promise<TenantAuthority | null> {
  const descriptor = readTenantAuthority(authority);
  const id = typeof claimId === 'string' ? claimId.trim() : '';
  if (!descriptor.principal || !id) return null;
  // db-access-guard: system-exempt -- reason: one claim's home tenant, only when the caller's tenant is its home or access tenant
  const rows = await dbAdmin
    .select({ tenantId: claims.tenantId })
    .from(claims)
    .where(
      and(
        eq(claims.id, id),
        or(eq(claims.tenantId, descriptor.tenantId), eq(claims.accessTenantId, descriptor.tenantId))
      )
    )
    .limit(1);
  const [row] = rows;
  if (!row) return null;
  if (row.tenantId === descriptor.tenantId) return authority;
  return mintTenantAuthority({
    tenantId: row.tenantId,
    purpose: 'claim-home-read',
    principal: descriptor.principal,
  });
}
