import type { TenantTransaction } from '@interdomestik/database';
import {
  claims,
  notificationDeliveries,
  pushSubscriptions,
  user,
  userNotificationPreferences as preferences,
} from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { isEmailSuppressed } from '../email';
import type { sendEmailOutcome } from '../email';
import type { sendPushOutcome } from '../push';
import { resolveRecipientLocale } from '../recipient-locale';
import { renderDelivery, renderDeliveryPush } from './render';
import { underLease } from './store';
import type { ClaimedDelivery, DeliveryDependencies, SkipReason } from './types';

type Prepared = { locale: NonNullable<ClaimedDelivery['locale']> } & (
  | { channel: 'email'; to: string; rendered: Parameters<typeof sendEmailOutcome>[2] }
  | {
      channel: 'push';
      subscription: Parameters<typeof sendPushOutcome>[0];
      rendered: Parameters<typeof sendPushOutcome>[1];
    }
);
type Preparation = Prepared | { skip: SkipReason } | { leaseLost: true };

export async function prepareNotificationDelivery(
  tx: TenantTransaction,
  lease: ClaimedDelivery,
  deps: DeliveryDependencies
): Promise<Preparation> {
  const [row] = await tx
    .select({
      ...getTableColumns(notificationDeliveries),
      stale: sql<boolean>`${notificationDeliveries.createdAt} < clock_timestamp() - interval '72 hours'`,
    })
    .from(notificationDeliveries)
    .where(underLease(lease))
    .for('update');
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
    const admitted =
      recipient.role === ROLES.tenant_admin ||
      (recipient.role === ROLES.staff &&
        (await deps.canStaffReadClaim(tx, {
          tenantId,
          claimId,
          userId: recipient.id,
          branchId: recipient.branchId,
        })));
    if (!admitted) return { skip: 'recipient_out_of_scope' };
  } else if (claim.ownerId !== recipient.id) {
    return { skip: 'recipient_out_of_scope' };
  }

  const previewRestricted =
    row.facts.previewRestricted !== false || recipient.role === ROLES.branch_manager;

  if (row.channel === 'push') {
    if (row.kind !== 'claim_message_to_member' && row.kind !== 'claim_status_changed') {
      throw new Error('Delivery kind does not support push');
    }
    const [prefs] = await tx
      .select()
      .from(preferences)
      .where(and(eq(preferences.tenantId, tenantId), eq(preferences.userId, recipient.id)));
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
          eq(pushSubscriptions.userId, recipient.id),
          eq(pushSubscriptions.id, row.pushSubscriptionId)
        )
      );
    if (!subscription) return { skip: 'subscription_gone' };
    const locale = await resolveRecipientLocale(tx, tenantId, recipient.id);
    return {
      channel: 'push',
      locale,
      subscription,
      rendered: await renderDeliveryPush(
        tx,
        { ...row, leaseUntil: row.leaseUntil },
        locale,
        previewRestricted
      ),
    };
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
