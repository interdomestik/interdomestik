import webPush, { type PushSubscription } from 'web-push';

import { db } from '@interdomestik/database';
import { pushSubscriptions, userNotificationPreferences } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import type { AuditLogger } from './types';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
};

function getVapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@interdomestik.com';

  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject,
  };
}

function toWebPushSubscription(row: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

export async function sendPushToUser(
  userId: string,
  channel: 'claim_updates' | 'messages',
  payload: PushPayload,
  deps?: {
    logAuditEvent?: AuditLogger;
  }
) {
  const vapid = getVapidDetails();
  if (!vapid) {
    return { success: false, skipped: true, reason: 'missing_vapid' as const };
  }

  // Respect stored preferences
  const [prefs] = await db
    .select({
      pushClaimUpdates: userNotificationPreferences.pushClaimUpdates,
      pushMessages: userNotificationPreferences.pushMessages,
    })
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);

  const allowed =
    channel === 'claim_updates' ? (prefs?.pushClaimUpdates ?? true) : (prefs?.pushMessages ?? true);

  if (!allowed) {
    return { success: false, skipped: true, reason: 'preferences_disabled' as const };
  }

  const subscriptions = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subscriptions.length === 0) {
    return { success: false, skipped: true, reason: 'no_subscription' as const };
  }

  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    icon: payload.icon,
    badge: payload.badge,
  });

  const results = await Promise.all(
    subscriptions.map(async sub => {
      try {
        await webPush.sendNotification(toWebPushSubscription(sub), body);
        return { ok: true, endpoint: sub.endpoint };
      } catch (error: unknown) {
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          typeof (error as { statusCode?: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : undefined;

        // Cleanup invalid/expired subscriptions.
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(
              and(
                eq(pushSubscriptions.userId, userId),
                eq(pushSubscriptions.endpoint, sub.endpoint)
              )
            );
        }

        return { ok: false, endpoint: sub.endpoint, statusCode };
      }
    })
  );

  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;

  if (deps?.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: userId,
      actorRole: 'system',
      action: 'push.sent',
      entityType: 'user',
      entityId: userId,
      metadata: {
        channel,
        okCount,
        failCount,
        title: payload.title,
        url: payload.url,
      },
    });
  }

  return { success: okCount > 0, okCount, failCount };
}
