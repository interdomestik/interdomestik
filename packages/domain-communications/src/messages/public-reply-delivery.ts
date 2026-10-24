import webPush, { type PushSubscription, type RequestOptions } from 'web-push';

import { sendNewMessageEmail } from '../email';
import type { AuditLogger } from '../types';
import type { PublicReplyNotificationPlan } from './public-reply-notification';

type VapidDetails = { subject: string; publicKey: string; privateKey: string };

export type PublicReplyDeliveryDeps = {
  removeExpiredSubscriptions?: (endpoints: string[]) => Promise<void>;
  logAuditEvent?: AuditLogger;
  /** Test seams; production uses web-push and VAPID env. */
  sendPush?: (
    subscription: PushSubscription,
    body: string,
    options: RequestOptions
  ) => Promise<unknown>;
  vapid?: VapidDetails | null;
};

function readVapidDetails(): VapidDetails | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@interdomestik.com';

  if (!publicKey || !privateKey) return null;
  if (
    typeof publicKey !== 'string' ||
    typeof privateKey !== 'string' ||
    typeof subject !== 'string'
  ) {
    return null;
  }

  return { publicKey: `${publicKey}`, privateKey: `${privateKey}`, subject: `${subject}` };
}

function readStatusCode(error: unknown): number | undefined {
  if (!(
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  )) {
    return undefined;
  }
  const statusCode: unknown = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? +statusCode : undefined;
}

function ownData(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Log only bounded error classification, never messages, SQL, params or stacks. */
export function describePublicReplyFailure(error: unknown): { name: string; code?: string } {
  const name = ownData(error, 'name');
  const code = ownData(error, 'code') ?? ownData(ownData(error, 'cause'), 'code');
  return {
    name:
      typeof name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name)
        ? `${name}`
        : error instanceof Error
          ? 'Error'
          : 'UnknownError',
    ...(typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code) ? { code: `${code}` } : {}),
  };
}

async function deliverEmail(plan: PublicReplyNotificationPlan): Promise<void> {
  if (!plan.verifiedEmail) {
    return;
  }

  await sendNewMessageEmail(plan.verifiedEmail, plan.claim, plan.senderName, plan.messageContent);
}

async function deliverPush(
  plan: PublicReplyNotificationPlan,
  deps: PublicReplyDeliveryDeps
): Promise<void> {
  const vapid = deps.vapid === undefined ? readVapidDetails() : deps.vapid;
  if (!vapid || plan.pushSubscriptions.length === 0) {
    return;
  }

  const send =
    deps.sendPush ??
    ((subscription: PushSubscription, body: string, options: RequestOptions) =>
      webPush.sendNotification(subscription, body, options));
  const title = 'New Message';
  const url = `/member/claims/${plan.claim.id}`;
  const body = JSON.stringify({
    title,
    body: `${plan.senderName}: ${plan.messageContent.substring(0, 100)}`,
    url,
  });

  const results = await Promise.all(
    plan.pushSubscriptions.map(async sub => {
      try {
        await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          vapidDetails: vapid,
        });
        return { ok: true, expired: false, endpoint: sub.endpoint };
      } catch (error: unknown) {
        const statusCode = readStatusCode(error);
        return {
          ok: false,
          expired: statusCode === 404 || statusCode === 410,
          endpoint: sub.endpoint,
        };
      }
    })
  );

  const expired = results.filter(r => r.expired).map(r => r.endpoint);
  if (expired.length > 0 && deps.removeExpiredSubscriptions) {
    await deps
      .removeExpiredSubscriptions(expired)
      .catch((error: unknown) =>
        console.error(
          'Failed to remove expired push subscriptions:',
          describePublicReplyFailure(error)
        )
      );
  }

  const okCount = results.filter(r => r.ok).length;
  await deps.logAuditEvent?.({
    tenantId: plan.tenantId,
    actorId: plan.actor.id,
    actorRole: plan.actor.role,
    action: 'push.sent',
    entityType: 'user',
    entityId: plan.recipientId,
    metadata: { channel: 'messages', okCount, failCount: results.length - okCount, title, url },
  });
}

/** Leaf delivery for a committed public-reply plan. Holds no database access and never throws. */
export async function deliverPublicReplyNotification(
  plan: PublicReplyNotificationPlan,
  deps: PublicReplyDeliveryDeps = {}
): Promise<void> {
  const [email, push] = await Promise.allSettled([deliverEmail(plan), deliverPush(plan, deps)]);
  if (email.status === 'rejected') {
    console.error('Failed to send new message email:', describePublicReplyFailure(email.reason));
  }
  if (push.status === 'rejected') {
    console.error('Failed to send new message push:', describePublicReplyFailure(push.reason));
  }
}
