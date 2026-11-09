import { sql } from 'drizzle-orm';

import type { TenantTransaction } from './tenant';

/**
 * ACQ-3b §3.5 person locks, transaction-scoped and always taken in this order. Lock 1 identifies
 * an unbound person by email HMAC; lock 2 a bound person by user id.
 */
export async function lockSponsorEntryIdentity(
  tx: TenantTransaction,
  emailHmac: string
): Promise<void> {
  const lockKey = `sponsor-entry:${emailHmac}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
}

export async function lockSponsorPerson(tx: TenantTransaction, userId: string): Promise<void> {
  const lockKey = `sponsor-user:${userId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
}
