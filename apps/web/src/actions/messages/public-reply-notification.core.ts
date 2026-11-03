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
  const prepared = await preparePublicReplyNotification(params).catch((error: unknown) => {
    console.error('Failed to create message notification:', describePublicReplyFailure(error));
    return null;
  });

  // Skipped, duplicate, or rolled back: no external work is ever registered.
  if (prepared?.status !== 'created') {
    return;
  }

  const { plan } = prepared;
  try {
    after(async () => {
      const subscriptions = await loadPublicReplyPushSubscriptions(plan).catch((error: unknown) => {
        console.error(
          'Failed to load public reply push subscriptions:',
          describePublicReplyFailure(error)
        );
        return [];
      });
      const deliveryPlan = Object.freeze({ ...plan, pushSubscriptions: subscriptions });
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
