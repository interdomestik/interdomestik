import 'server-only';

import {
  user,
  pushSubscriptions,
  userNotificationPreferences,
} from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq, inArray } from 'drizzle-orm';

export type PreviewRecipient = { authority: TenantAuthority; recipientId: string };
export type PreviewSubscription = { endpoint: string; p256dh: string; auth: string };

export async function loadPreviewEmail({ authority, recipientId }: PreviewRecipient) {
  const { tenantId, accessTenantId } = readTenantAuthority(authority);
  if (tenantId !== accessTenantId) return null;
  return await withTenantAuthority(authority, async tx => {
    const recipient = await tx.query.user.findFirst({
      where: and(eq(user.tenantId, tenantId), eq(user.id, recipientId)),
      columns: { email: true, emailVerified: true },
    });
    return recipient?.emailVerified ? recipient.email : null;
  });
}

/** As in public-reply delivery, load preferences and destinations before the final role check. */
export async function loadPreviewSubscriptions({ authority, recipientId }: PreviewRecipient) {
  const { tenantId, accessTenantId } = readTenantAuthority(authority);
  if (tenantId !== accessTenantId) return [];
  return await withTenantAuthority(authority, async tx => {
    const [prefs] = await tx
      .select({ messages: userNotificationPreferences.pushMessages })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.tenantId, tenantId),
          eq(userNotificationPreferences.userId, recipientId)
        )
      )
      .limit(1);
    if (!(prefs?.messages ?? true)) return [];
    return tx
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.userId, recipientId))
      );
  });
}

export async function removePreviewSubscriptions(
  { authority, recipientId }: PreviewRecipient,
  subscriptions: readonly PreviewSubscription[],
  endpoints: string[]
) {
  const planned = new Set(subscriptions.map(sub => sub.endpoint));
  const targets = [...new Set(endpoints)].filter(endpoint => planned.has(endpoint));
  if (!targets.length) return;
  const { tenantId, accessTenantId } = readTenantAuthority(authority);
  if (tenantId !== accessTenantId) return;
  await withTenantAuthority(authority, tx =>
    tx
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.userId, recipientId),
          inArray(pushSubscriptions.endpoint, targets)
        )
      )
  );
}
