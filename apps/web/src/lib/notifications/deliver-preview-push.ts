import webPush from 'web-push';
import { resolvePushDestination } from '@interdomestik/domain-communications/email/templates';
import { logAuditEvent } from '@/lib/audit';
import type { PushPayload } from '@/lib/push';
import {
  removePreviewSubscriptions,
  type PreviewRecipient,
  type PreviewSubscription,
} from './delivery-targets';

/** Leaf dispatch: all destination reads and the final recipient-role check have already completed. */
export async function deliverPreviewPush(
  recipient: PreviewRecipient,
  subscriptions: readonly PreviewSubscription[],
  payload: PushPayload
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !subscriptions.length) return;
  const vapidDetails = {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || 'mailto:support@interdomestik.com',
  };
  const destination = resolvePushDestination(payload.url);
  const body = JSON.stringify({ ...payload, url: destination });
  const results = await Promise.all(
    subscriptions.map(async sub => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { vapidDetails }
        );
        return { ok: true, expired: false, endpoint: sub.endpoint };
      } catch (error: unknown) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? error.statusCode
            : null;
        return {
          ok: false,
          expired: statusCode === 404 || statusCode === 410,
          endpoint: sub.endpoint,
        };
      }
    })
  );
  await removePreviewSubscriptions(
    recipient,
    subscriptions,
    results.filter(result => result.expired).map(result => result.endpoint)
  );
  const okCount = results.filter(result => result.ok).length;
  await logAuditEvent({
    authority: recipient.authority,
    actorId: recipient.recipientId,
    actorRole: 'system',
    action: 'push.sent',
    entityType: 'user',
    entityId: recipient.recipientId,
    metadata: {
      channel: 'messages',
      okCount,
      failCount: results.length - okCount,
      title: payload.title,
      url: destination,
    },
  });
}
