import { sql } from 'drizzle-orm';
import type { TenantTransaction } from './tenant';

/** Held until the caller's tenant transaction ends, including when no branch rows exist yet. */
export async function lockBranchPolicy(tx: TenantTransaction, tenantId: string): Promise<void> {
  const lockKey = `pilot-single-active-branch:${tenantId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
}
