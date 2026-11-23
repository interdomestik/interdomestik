import type { TenantTransaction } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';
import { INSERT_BATCH_ROWS } from './enqueue';

type InboxNotification = Pick<
  typeof notifications.$inferInsert,
  'id' | 'tenantId' | 'userId' | 'type' | 'title' | 'content' | 'actionUrl'
> & { previewRestricted: boolean };

export async function enqueueClaimInboxNotification(
  tx: TenantTransaction,
  notification: InboxNotification
): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: tenant from the command's transaction and recipient from a scoped read
  await tx.insert(notifications).values(notification).onConflictDoNothing({
    target: notifications.id,
  });
}

/**
 * Inserts inbox rows in multi-row statements of at most `INSERT_BATCH_ROWS` rows; each row keeps
 * its own id conflict handling.
 */
export async function enqueueClaimInboxNotifications(
  tx: TenantTransaction,
  rows: readonly InboxNotification[]
): Promise<void> {
  await insertInboxBatches(tx, rows, 0);
}

// Recursion, not a loop with a callback: the transaction stays a parameter, never captured.
async function insertInboxBatches(
  tx: TenantTransaction,
  rows: readonly InboxNotification[],
  from: number
): Promise<void> {
  const batch = rows.slice(from, from + INSERT_BATCH_ROWS);
  if (batch.length === 0) return;
  // db-access-guard: tenant-scoped -- reason: tenant from the command's transaction and recipients from a scoped read
  await tx.insert(notifications).values(batch).onConflictDoNothing({ target: notifications.id });
  await insertInboxBatches(tx, rows, from + INSERT_BATCH_ROWS);
}
