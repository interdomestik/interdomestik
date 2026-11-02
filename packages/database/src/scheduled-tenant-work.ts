import { asc } from 'drizzle-orm';
import { dbAdmin } from './db';
import { tenants } from './schema/tenants';

/** Upper bound on tenants a single scheduled run will visit; exceeding it fails closed. */
export const MAX_SCHEDULED_TENANTS = 500;

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
