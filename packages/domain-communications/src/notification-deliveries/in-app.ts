import type { TenantTransaction } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';

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

/** Inserts several inbox rows in one statement; each row keeps its own id conflict handling. */
export async function enqueueClaimInboxNotifications(
  tx: TenantTransaction,
  rows: readonly InboxNotification[]
): Promise<void> {
  if (rows.length === 0) return;
  // db-access-guard: tenant-scoped -- reason: tenant from the command's transaction and recipients from a scoped read
  await tx
    .insert(notifications)
    .values([...rows])
    .onConflictDoNothing({
      target: notifications.id,
    });
}
