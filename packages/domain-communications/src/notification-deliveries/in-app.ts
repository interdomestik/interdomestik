import type { TenantTransaction } from '@interdomestik/database';
import { notificationPreviewRestrictions, notifications } from '@interdomestik/database/schema';
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
  await insertInboxBatches(tx, [notification], 0);
}

function inboxRow({ previewRestricted: _flag, ...row }: InboxNotification) {
  return row;
}

function flagRow(row: InboxNotification) {
  return { tenantId: row.tenantId, notificationId: row.id, restricted: row.previewRestricted };
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
  const inserted = await tx
    .insert(notifications)
    .values(batch.map(inboxRow))
    .onConflictDoNothing({ target: notifications.id })
    .returning({ id: notifications.id });
  // A conflicting id is an earlier row (possibly a flagless legacy row): it keeps its own state.
  const created = new Set(inserted.map(row => row.id));
  const flags = batch.filter(row => created.has(row.id)).map(flagRow);
  if (flags.length > 0) {
    // db-access-guard: tenant-scoped -- reason: flags only for the inbox rows this batch created
    await tx
      .insert(notificationPreviewRestrictions)
      .values(flags)
      .onConflictDoNothing({ target: notificationPreviewRestrictions.notificationId });
  }
  await insertInboxBatches(tx, rows, from + INSERT_BATCH_ROWS);
}
