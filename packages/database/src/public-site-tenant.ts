import { and, eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { tenants } from './schema/tenants';
import { mintTenantAuthority, type TenantAuthority } from './tenant-authority';

// Anonymous intake on a tenant's public site (a lead form, a free-start reservation) writes into the
// tenant the site serves before any session exists. The caller resolves that tenant from the server
// request contract (host first), never from the payload; this producer only confirms the tenant is
// active and mints a short-lived authority with no principal. The tenant guard names every module
// allowed to call it, so each anonymous writer is an explicitly reviewed intake.

/** The authority of the active tenant a public site request resolved to; null when it is not active. */
export async function authorizePublicSiteTenant(tenantId: string): Promise<TenantAuthority | null> {
  const normalized = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!normalized) return null;
  // db-access-guard: system-exempt -- reason: existence probe of one active tenant id; no row data is returned
  const [active] = await dbAdmin
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, normalized), eq(tenants.isActive, true)))
    .limit(1);
  if (!active) return null;
  return mintTenantAuthority({ tenantId: active.id, purpose: 'public-site' });
}
