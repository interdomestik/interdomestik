import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { getNotificationRecipientRole } from '@/lib/notifications/recipient-role';
import { getBranchManagerNotificationCopy } from '@/lib/notifications/branch-manager-copy';
import {
  deliverPublicReplyNotification,
  describePublicReplyFailure,
  loadPublicReplyPushSubscriptions,
  preparePublicReplyNotification,
  removeExpiredPublicReplySubscriptions,
} from '@interdomestik/domain-communications/messages/send';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { after } from 'next/server';

import { logAuditEvent } from '@/lib/audit';
import type { Session } from './context';

/**
 * Persists the public-reply in-app notification in its own tenant transaction and
 * registers email/push delivery only after that transaction has committed.
 * Never throws: notification failure must not fail the persisted message response.
 */
export async function notifyPublicReplyCore(params: {
  session: NonNullable<Session>;
  authority: TenantAuthority;
  claimId: string;
  messageId: string;
  expectedRecipientId: string;
}): Promise<void> {
  const recipientRole = await getNotificationRecipientRole(
    params.authority,
    params.expectedRecipientId
  ).catch(() => null);
  if (!recipientRole) return;
  const initialCopy = deniesClaimMessageContent(recipientRole)
    ? await getBranchManagerNotificationCopy('new_message').catch(() => null)
    : null;
  if (deniesClaimMessageContent(recipientRole) && !initialCopy) return;
  const prepared = await preparePublicReplyNotification(params).catch((error: unknown) => {
    console.error('Failed to create message notification:', describePublicReplyFailure(error));
    return null;
  });

  // Skipped, duplicate, or rolled back: no external work is ever registered.
  if (prepared?.status !== 'created') {
    return;
  }

  const plan = initialCopy
    ? Object.freeze({
        ...prepared.plan,
        claim: Object.freeze({ id: prepared.plan.claim.id, title: initialCopy.title }),
        senderName: initialCopy.title,
        messageContent: initialCopy.content,
      })
    : prepared.plan;
  try {
    after(async () => {
      const subscriptions = await loadPublicReplyPushSubscriptions(plan).catch((error: unknown) => {
        console.error(
          'Failed to load public reply push subscriptions:',
          describePublicReplyFailure(error)
        );
        return [];
      });
      // Resolve role immediately before attaching external previews; failed lookup suppresses delivery.
      const recipientRole = await getNotificationRecipientRole(
        plan.authority,
        plan.recipientId
      ).catch(() => null);
      if (!recipientRole) return;
      const copy = deniesClaimMessageContent(recipientRole)
        ? await getBranchManagerNotificationCopy('new_message').catch(() => null)
        : null;
      if (deniesClaimMessageContent(recipientRole) && !copy) return;
      const deliveryPlan = Object.freeze({
        ...plan,
        ...(copy
          ? {
              claim: Object.freeze({ id: plan.claim.id, title: copy.title }),
              senderName: copy.title,
              messageContent: copy.content,
            }
          : {}),
        pushSubscriptions: subscriptions,
      });
      await deliverPublicReplyNotification(deliveryPlan, {
        removeExpiredSubscriptions: endpoints =>
          removeExpiredPublicReplySubscriptions(deliveryPlan, endpoints),
        logAuditEvent,
      }).catch((error: unknown) =>
        console.error('Failed to deliver message notification:', describePublicReplyFailure(error))
      );
    });
  } catch (error) {
    console.error(
      'Failed to schedule message notification delivery:',
      describePublicReplyFailure(error)
    );
  }
}
