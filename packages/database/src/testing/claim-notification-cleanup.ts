import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import {
  claimMessages,
  claimResponseRequests as requests,
  claims,
  notificationDeliveries as deliveries,
  notifications,
} from '../schema';
import type { TenantTransaction } from '../tenant';

type CleanupScope =
  | { claimIds: readonly string[]; tenantId?: string }
  | { messageIds: readonly string[]; tenantId?: string }
  | { userIds: readonly string[]; tenantId?: string };

/** Remove claim notification dependencies before deleting the seed's claims, messages or users. */
export async function cleanupClaimNotificationRows(
  db: Pick<TenantTransaction, 'delete' | 'select'>,
  scope: CleanupScope
) {
  const tenant = scope.tenantId;
  const deliveryTenant = tenant === undefined ? undefined : eq(deliveries.tenantId, tenant);
  const requestTenant = tenant === undefined ? undefined : eq(requests.tenantId, tenant);
  const inboxTenant = tenant === undefined ? undefined : eq(notifications.tenantId, tenant);
  if ('claimIds' in scope) {
    if (scope.claimIds.length === 0) return;
    await db
      .delete(deliveries)
      .where(and(deliveryTenant, inArray(deliveries.claimId, scope.claimIds)));
    await db.delete(requests).where(and(requestTenant, inArray(requests.claimId, scope.claimIds)));
    await db.delete(notifications).where(
      and(
        inboxTenant,
        exists(
          db
            .select({ id: claims.id })
            .from(claims)
            .where(
              and(
                inArray(claims.id, scope.claimIds),
                eq(claims.tenantId, notifications.tenantId),
                sql`${notifications.actionUrl} in (
                  '/member/claims/' || ${claims.id},
                  '/staff/claims/' || ${claims.id},
                  '/dashboard/claims/' || ${claims.id}
                )`
              )
            )
        )
      )
    );
  } else if ('messageIds' in scope) {
    if (scope.messageIds.length === 0) return;
    await db
      .delete(deliveries)
      .where(and(deliveryTenant, inArray(deliveries.subjectMessageId, scope.messageIds)));
    await db
      .delete(requests)
      .where(
        and(
          requestTenant,
          or(
            inArray(requests.sourceMessageId, scope.messageIds),
            inArray(requests.answerMessageId, scope.messageIds)
          )
        )
      );
    await db.delete(notifications).where(
      and(
        inboxTenant,
        exists(
          db
            .select({ id: claimMessages.id })
            .from(claimMessages)
            .where(
              and(
                inArray(claimMessages.id, scope.messageIds),
                eq(claimMessages.tenantId, notifications.tenantId),
                sql`${notifications.id} in (
                  'ntf_new_message_' || ${claimMessages.id},
                  'ntf_staff:staff_member_message:' || ${claimMessages.id} || ':' || ${notifications.userId} || ':in_app'
                )`
              )
            )
        )
      )
    );
  } else {
    if (scope.userIds.length === 0) return;
    await db
      .delete(deliveries)
      .where(and(deliveryTenant, inArray(deliveries.recipientUserId, scope.userIds)));
    // The answerer's globally unique user ID can be referenced by a claim in another tenant.
    await db.delete(requests).where(inArray(requests.answeredBy, scope.userIds));
    // In-app notifications cascade when the user is deleted.
  }
}
