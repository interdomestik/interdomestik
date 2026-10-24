import { claimMessages, withTenantContext } from '@interdomestik/database';
import {
  notifications,
  pushSubscriptions,
  userNotificationPreferences,
} from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq, inArray } from 'drizzle-orm';
import type { Session } from '../types';
import { hasScopedStaffClaimAccess, isFullTenantClaimsRole } from './access';

export type PublicReplyPushSubscription = Readonly<{
  endpoint: string;
  p256dh: string;
  auth: string;
}>;

/** Immutable post-commit delivery plan: scalars only, never a transaction or client. */
export type PublicReplyNotificationPlan = Readonly<{
  notificationId: string;
  tenantId: string;
  actor: Readonly<{ id: string; role: string }>;
  recipientId: string;
  verifiedEmail: string | null;
  claim: Readonly<{ id: string; title: string }>;
  senderName: string;
  messageContent: string;
  pushSubscriptions: ReadonlyArray<PublicReplyPushSubscription>;
}>;

export type PublicReplyNotificationSkipReason =
  | 'unauthorized'
  | 'not_staff'
  | 'claim_not_found'
  | 'access_denied'
  | 'recipient_mismatch'
  | 'message_mismatch'
  | 'recipient_not_found'
  | 'duplicate';

export type PreparePublicReplyNotificationResult =
  | { status: 'created'; plan: PublicReplyNotificationPlan }
  | { status: 'skipped'; reason: PublicReplyNotificationSkipReason };

function skipped(reason: PublicReplyNotificationSkipReason): PreparePublicReplyNotificationResult {
  return { status: 'skipped', reason };
}

/**
 * Re-admits a committed public staff reply and persists exactly one in-app new_message
 * notification for the expected claim owner, all inside one tenant transaction.
 * Returns a delivery plan only when this call inserted the notification row.
 */
export async function preparePublicReplyNotification(params: {
  session: NonNullable<Session>;
  claimId: string;
  messageId: string;
  expectedRecipientId: string;
}): Promise<PreparePublicReplyNotificationResult> {
  const actor = params.session.user;
  if (!actor?.id) {
    return skipped('unauthorized');
  }

  const tenantId = ensureTenantId(params.session);
  const actorId = actor.id;
  const role = actor.role || 'user';
  const branchId = actor.branchId ?? null;
  const senderName = actor.name || 'Agent';
  const isScopedStaff = role === 'staff';

  // Same staff admission as sendMessageDbCore; branch_manager/member/agent never notify.
  if (!isScopedStaff && !isFullTenantClaimsRole(role)) {
    return skipped('not_staff');
  }

  return withTenantContext<PreparePublicReplyNotificationResult>({ tenantId, role }, async tx => {
    const claim = await tx.query.claims.findFirst({
      where: (claimsTable, { eq }) =>
        withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, params.claimId)),
    });
    if (!claim) {
      return skipped('claim_not_found');
    }
    if (isScopedStaff && !hasScopedStaffClaimAccess({ branchId, claim, userId: actorId })) {
      return skipped('access_denied');
    }
    // A changed owner must not receive a notification computed for the previous owner.
    if (claim.userId !== params.expectedRecipientId) {
      return skipped('recipient_mismatch');
    }

    const [message] = await tx
      .select({
        id: claimMessages.id,
        senderId: claimMessages.senderId,
        content: claimMessages.content,
        isInternal: claimMessages.isInternal,
      })
      .from(claimMessages)
      .where(
        withTenant(
          tenantId,
          claimMessages.tenantId,
          and(eq(claimMessages.id, params.messageId), eq(claimMessages.claimId, claim.id))
        )
      )
      .limit(1);
    if (!message || message.senderId !== actorId || message.isInternal !== false) {
      return skipped('message_mismatch');
    }

    const recipientId = claim.userId;
    const recipient = await tx.query.user.findFirst({
      where: (users, { eq }) => withTenant(tenantId, users.tenantId, eq(users.id, recipientId)),
      columns: { id: true, email: true, emailVerified: true, tenantId: true },
    });
    if (!recipient || recipient.tenantId !== tenantId) {
      return skipped('recipient_not_found');
    }

    const notificationId = `ntf_new_message_${message.id}`;
    // db-access-guard: tenant-scoped -- reason: tenantId from validated session; recipient re-read in this transaction
    const inserted = await tx
      .insert(notifications)
      .values({
        id: notificationId,
        tenantId,
        userId: recipient.id,
        type: 'new_message',
        title: 'New Message',
        content: `Update on: ${claim.title}`,
        actionUrl: `/member/claims/${claim.id}`,
        isRead: false,
      })
      .onConflictDoNothing({ target: notifications.id })
      .returning({ id: notifications.id });
    if (inserted.length === 0) {
      return skipped('duplicate');
    }

    return {
      status: 'created',
      plan: Object.freeze({
        notificationId,
        tenantId,
        actor: Object.freeze({ id: actorId, role }),
        recipientId: recipient.id,
        verifiedEmail: recipient.email && recipient.emailVerified ? recipient.email : null,
        claim: Object.freeze({ id: claim.id, title: claim.title }),
        senderName,
        messageContent: message.content,
        pushSubscriptions: Object.freeze([]),
      }),
    };
  });
}

/** Optional push preparation runs after the in-app notification has committed. */
export async function loadPublicReplyPushSubscriptions(
  plan: PublicReplyNotificationPlan
): Promise<ReadonlyArray<PublicReplyPushSubscription>> {
  return withTenantContext({ tenantId: plan.tenantId, role: plan.actor.role }, async tx => {
    const recipient = await tx.query.user.findFirst({
      where: (users, { eq }) =>
        withTenant(plan.tenantId, users.tenantId, eq(users.id, plan.recipientId)),
      columns: { id: true },
    });
    if (!recipient) return [];
    const [prefs] = await tx
      .select({ pushMessages: userNotificationPreferences.pushMessages })
      .from(userNotificationPreferences)
      .where(
        withTenant(
          plan.tenantId,
          userNotificationPreferences.tenantId,
          eq(userNotificationPreferences.userId, plan.recipientId)
        )
      )
      .limit(1);

    const subscriptions =
      (prefs?.pushMessages ?? true)
        ? await tx
            .select({
              endpoint: pushSubscriptions.endpoint,
              p256dh: pushSubscriptions.p256dh,
              auth: pushSubscriptions.auth,
            })
            .from(pushSubscriptions)
            .where(
              withTenant(
                plan.tenantId,
                pushSubscriptions.tenantId,
                eq(pushSubscriptions.userId, plan.recipientId)
              )
            )
        : [];

    return Object.freeze(
      subscriptions.map(sub =>
        Object.freeze({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        })
      )
    );
  });
}

/** Post-commit cleanup of expired endpoints, limited to endpoints the plan itself carried. */
export async function removeExpiredPublicReplySubscriptions(
  plan: PublicReplyNotificationPlan,
  endpoints: ReadonlyArray<string>
): Promise<void> {
  const planned = new Set(plan.pushSubscriptions.map(sub => sub.endpoint));
  const targets = [...new Set(endpoints)].filter(endpoint => planned.has(endpoint));
  if (targets.length === 0) {
    return;
  }

  await withTenantContext({ tenantId: plan.tenantId, role: plan.actor.role }, async tx => {
    // db-access-guard: tenant-scoped -- reason: tenant/user/endpoints come from the committed notification plan
    await tx
      .delete(pushSubscriptions)
      .where(
        withTenant(
          plan.tenantId,
          pushSubscriptions.tenantId,
          and(
            eq(pushSubscriptions.userId, plan.recipientId),
            inArray(pushSubscriptions.endpoint, targets)
          )
        )
      );
  });
}
