import { asc, eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { requireIngressCapability, type IngressCapability } from './ingress-capability';
import { tenants } from './schema/tenants';
import { mintTenantAuthority, type TenantAuthority } from './tenant-authority';

/** Upper bound on tenants a single scheduled run will visit; exceeding it fails closed. */
export const MAX_SCHEDULED_TENANTS = 500;

export type ScheduledTenantWork = Readonly<{ tenantId: string; authority: TenantAuthority }>;

// Scheduled jobs (cron, campaign and snapshot schedulers) have no session tenant. This fixed
// lookup returns only tenant identifiers, ordered by id, so a job can run its own eligibility
// query per tenant inside withTenantContext. It returns no row data and grants no row access:
// every eligible row is still selected under RLS for exactly one tenant. Callers are the
// cron-authorized job entry points; the list must never be returned to a request caller.
export async function listTenantIdsForScheduledWork(): Promise<string[]> {
  // db-access-guard: system-exempt -- reason: scheduler tenant id enumeration only; all row reads and writes stay in withTenantContext
  const rows = await dbAdmin
    .select({ id: tenants.id })
    .from(tenants)
    .orderBy(asc(tenants.id))
    .limit(MAX_SCHEDULED_TENANTS + 1);
  if (rows.length > MAX_SCHEDULED_TENANTS) {
    throw new Error(`Scheduled work exceeds ${MAX_SCHEDULED_TENANTS} tenants`);
  }
  return rows.map(row => row.id);
}

/**
 * The scheduled-work producer: one system authority per tenant, minted only for a run that entered
 * through the cron secret or an Inngest invocation. The authorities carry no principal.
 */
export async function listScheduledTenantWork(
  ingress: IngressCapability<'cron' | 'inngest'>
): Promise<ScheduledTenantWork[]> {
  requireIngressCapability(ingress, ['cron', 'inngest']);
  const tenantIds = await listTenantIdsForScheduledWork();
  return tenantIds.map(tenantId =>
    Object.freeze({
      tenantId,
      authority: mintTenantAuthority({ tenantId, purpose: 'scheduled-work' }),
    })
  );
}

/**
 * Event-driven work: an Inngest run (invoked only through the signed serve endpoint) acting for the
 * one tenant its event names. Our server is the only event sender, so the event tenant is server
 * data; it must still name an existing tenant, and every row the run reads stays under RLS for that
 * tenant, so a row from another tenant is invisible rather than reachable.
 */
export async function authorizeInngestEventTenant(
  ingress: IngressCapability<'inngest'>,
  tenantId: string
): Promise<TenantAuthority> {
  requireIngressCapability(ingress, ['inngest']);
  const normalized = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!normalized) throw new Error('Inngest tenant authority requires an event tenant');
  // db-access-guard: system-exempt -- reason: existence probe of one tenant id; no row data is returned
  const [row] = await dbAdmin
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, normalized))
    .limit(1);
  if (!row) throw new Error('Inngest tenant authority requires an existing tenant');
  return mintTenantAuthority({ tenantId: row.id, purpose: 'scheduled-work' });
}
