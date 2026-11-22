import type { TenantTransaction } from '@interdomestik/database';
import {
  claims,
  pushSubscriptions,
  user,
  userNotificationPreferences as preferences,
} from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { isEmailSuppressed } from '@interdomestik/domain-communications/email';
import type { sendEmailOutcome } from '@interdomestik/domain-communications/email';
import type { sendPushOutcome } from '@interdomestik/domain-communications/push';
import { resolveRecipientLocale } from '@interdomestik/domain-communications/recipient-locale';
import {
  readDeliveryUnderLease,
  renderDelivery,
  renderDeliveryPush,
  type ClaimedDelivery,
  type DeliveryDependencies,
  type SkipReason,
} from '@interdomestik/domain-communications/notification-deliveries/worker';
import { canReceiveStaffClaimNotification } from '../staff-claims/notification-recipients';

export type PreparedNotificationDelivery = { locale: NonNullable<ClaimedDelivery['locale']> } & (
  | { channel: 'email'; to: string; rendered: Parameters<typeof sendEmailOutcome>[2] }
  | {
      channel: 'push';
      subscription: Parameters<typeof sendPushOutcome>[0];
      rendered: Parameters<typeof sendPushOutcome>[1];
    }
);
type Preparation = PreparedNotificationDelivery | { skip: SkipReason } | { leaseLost: true };

async function preparePushDelivery(
  tx: TenantTransaction,
  row: ClaimedDelivery,
  recipientId: string,
  previewRestricted: boolean
): Promise<Preparation> {
  const { tenantId } = row;
  if (row.kind !== 'claim_message_to_member' && row.kind !== 'claim_status_changed') {
    throw new Error('Delivery kind does not support push');
  }
  const [prefs] = await tx
    .select()
    .from(preferences)
    .where(and(eq(preferences.tenantId, tenantId), eq(preferences.userId, recipientId)));
  const allowed =
    row.kind === 'claim_message_to_member' ? prefs?.pushMessages : prefs?.pushClaimUpdates;
  if (allowed === false) return { skip: 'push_disabled' };
  if (!row.pushSubscriptionId) return { skip: 'subscription_gone' };
  const [subscription] = await tx
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.tenantId, tenantId),
        eq(pushSubscriptions.userId, recipientId),
        eq(pushSubscriptions.id, row.pushSubscriptionId)
      )
    );
  if (!subscription) return { skip: 'subscription_gone' };
  const locale = await resolveRecipientLocale(tx, tenantId, recipientId);
  return {
    channel: 'push',
    locale,
    subscription,
    rendered: await renderDeliveryPush(tx, row, locale, previewRestricted),
  };
}

export async function prepareNotificationDelivery(
  tx: TenantTransaction,
  lease: ClaimedDelivery,
  deps: DeliveryDependencies
): Promise<Preparation> {
  const row = await readDeliveryUnderLease(tx, lease);
  if (!row?.leaseUntil) return { leaseLost: true };
  if (row.stale) return { skip: 'stale' };
  const { tenantId, claimId, recipientUserId } = row;
  const [recipient] = await tx
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      branchId: user.branchId,
      role: user.role,
    })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.id, recipientUserId)))
    .for('share');
  if (!recipient) return { skip: 'recipient_missing' };

  const [claim] = await tx
    .select({
      ownerId: claims.userId,
      category: claims.category,
      claimNumber: claims.claimNumber,
    })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)));
  if (!claim) return { skip: 'claim_gone' };

  if (row.kind === 'staff_claim_submitted' || row.kind === 'staff_member_message') {
    const admitted = await canReceiveStaffClaimNotification(tx, { tenantId, claimId }, recipient);
    if (!admitted) return { skip: 'recipient_out_of_scope' };
  } else if (claim.ownerId !== recipient.id) {
    return { skip: 'recipient_out_of_scope' };
  }

  const previewRestricted =
    row.facts.previewRestricted !== false || recipient.role === ROLES.branch_manager;

  if (row.channel === 'push') {
    return preparePushDelivery(
      tx,
      { ...row, leaseUntil: row.leaseUntil },
      recipient.id,
      previewRestricted
    );
  }

  if (!recipient.emailVerified) return { skip: 'email_unverified' };
  if (isEmailSuppressed(recipient.email)) return { skip: 'email_suppressed' };
  const locale = await resolveRecipientLocale(tx, tenantId, recipient.id);
  const rendered = await renderDelivery(
    tx,
    { ...row, leaseUntil: row.leaseUntil },
    locale,
    deps.appOrigin(tenantId),
    claim.category,
    claim.claimNumber,
    previewRestricted
  );
  return { channel: 'email', locale, to: recipient.email, rendered };
}
