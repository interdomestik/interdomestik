import { sql } from 'drizzle-orm';
import type { TenantTransaction } from './tenant';

export type ClaimEvidenceObject = { bucket: string; path: string };

/** The advisory-lock key of one stored evidence object of a tenant. */
export function claimEvidenceObjectLockKey(tenantId: string, object: ClaimEvidenceObject): string {
  return JSON.stringify(['claim-evidence-object', tenantId, object.bucket, object.path]);
}

/**
 * Serializes every transaction that attaches one of these stored objects to a claim, whichever
 * claim it writes to. Held until the caller's tenant transaction ends. Keys are taken in sorted
 * order, so two writers never wait on each other in a cycle; a hash collision only adds waiting.
 */
export async function lockClaimEvidenceObjects(
  tx: TenantTransaction,
  tenantId: string,
  objects: readonly ClaimEvidenceObject[]
): Promise<void> {
  const keys = [...new Set(objects.map(object => claimEvidenceObjectLockKey(tenantId, object)))];
  keys.sort((a, b) => a.localeCompare(b));
  await lockKeysInOrder(tx, keys, 0);
}

/** One at a time, in this order: the order is what keeps concurrent writers deadlock-free. */
async function lockKeysInOrder(
  tx: TenantTransaction,
  keys: readonly string[],
  index: number
): Promise<void> {
  if (index >= keys.length) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${keys[index]}, 0))`);
  await lockKeysInOrder(tx, keys, index + 1);
}
