import type { TenantTransaction } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import {
  pushSubscriptions,
  user,
  userNotificationPreferences as preferences,
} from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import { resolveRecipientLocale } from '../recipient-locale';
import { enqueueClaimInboxNotification } from './in-app';
import { notificationDeliveryKey, type EnqueueDelivery } from './keys';
import { enqueueNotificationDelivery } from './store';

export async function lockClaimNotificationRecipient(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
) {
  const recipients = await tx
    .select({ id: user.id, role: user.role, emailVerified: user.emailVerified })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.id, userId)))
    .for('share');
  return recipients.at(0);
}

type ClaimOwnerEvent = {
  tenantId: string;
  claimId: string;
  recipient: Awaited<ReturnType<typeof lockClaimNotificationRecipient>>;
  title: string;
};
type OwnerSource = Extract<
  EnqueueDelivery,
  {
    channel: 'email';
    kind:
      | 'claim_submitted'
      | 'claim_status_changed'
      | 'claim_recovery_decision'
      | 'claim_message_to_member';
  }
>;

async function queueOwnerDeliveryChannels(
  tx: TenantTransaction,
  source: OwnerSource,
  emailVerified: boolean
): Promise<string[]> {
  const deliveryIds: string[] = [];
  if (emailVerified) {
    const id = await enqueueNotificationDelivery(tx, source);
    if (id) deliveryIds.push(id);
  }

  if (source.kind !== 'claim_status_changed' && source.kind !== 'claim_message_to_member') {
    return deliveryIds;
  }

  const { tenantId, recipientUserId } = source;
  const [prefs] = await tx
    .select({
      claimUpdates: preferences.pushClaimUpdates,
      messages: preferences.pushMessages,
    })
    .from(preferences)
    .where(and(eq(preferences.tenantId, tenantId), eq(preferences.userId, recipientUserId)));
  const allowed = source.kind === 'claim_status_changed' ? prefs?.claimUpdates : prefs?.messages;
  if (allowed === false) return deliveryIds;

  const subscriptions = await tx
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.userId, recipientUserId))
    );
  for await (const subscription of subscriptions) {
    const id = await enqueueNotificationDelivery(tx, {
      ...source,
      id: randomUUID(),
      channel: 'push',
      pushSubscriptionId: subscription.id,
    });
    if (id) deliveryIds.push(id);
  }
  return deliveryIds;
}

function memberClaimUpdate({ claimId, title }: ClaimOwnerEvent) {
  return { actionUrl: `/member/claims/${claimId}`, content: `Update on: ${title}` };
}

export async function enqueueClaimSubmittedNotification(
  tx: TenantTransaction,
  args: ClaimOwnerEvent
) {
  const { tenantId, claimId, recipient } = args;
  if (!recipient) return [];
  const source = { kind: 'claim_submitted', claimId } as const;
  await enqueueClaimInboxNotification(tx, {
    ...memberClaimUpdate(args),
    id: `ntf_${notificationDeliveryKey({ ...source, channel: 'in_app' })}`,
    tenantId,
    userId: recipient.id,
    type: source.kind,
    title: 'Claim Submitted',
    previewRestricted: false,
  });
  return queueOwnerDeliveryChannels(
    tx,
    {
      ...source,
      tenantId,
      recipientUserId: recipient.id,
      id: randomUUID(),
      channel: 'email',
    },
    recipient.emailVerified
  );
}

export async function enqueueClaimStatusNotification(
  tx: TenantTransaction,
  args: ClaimOwnerEvent & {
    fromStatus: ClaimStatus;
    toStatus: ClaimStatus;
    lifecycleVersion: number;
  }
) {
  const { tenantId, claimId, recipient, lifecycleVersion, fromStatus, toStatus } = args;
  if (!recipient || fromStatus === toStatus) return [];
  const source = {
    kind: 'claim_status_changed',
    claimId,
    lifecycleVersion,
    facts: { fromStatus, toStatus },
  } as const;
  await enqueueClaimInboxNotification(tx, {
    ...memberClaimUpdate(args),
    id: `ntf_${notificationDeliveryKey({ ...source, channel: 'in_app' })}`,
    tenantId,
    userId: recipient.id,
    type: source.kind,
    title: 'Claim Status Updated',
    previewRestricted: false,
  });
  return queueOwnerDeliveryChannels(
    tx,
    {
      ...source,
      tenantId,
      recipientUserId: recipient.id,
      id: randomUUID(),
      channel: 'email',
    },
    recipient.emailVerified
  );
}

export async function enqueueRecoveryDecisionNotification(
  tx: TenantTransaction,
  args: ClaimOwnerEvent & { decision: 'accepted' | 'declined'; decisionDomainEventId: string }
) {
  const { tenantId, claimId, recipient, decision, decisionDomainEventId } = args;
  if (!recipient) return [];
  const source = {
    kind: 'claim_recovery_decision',
    decisionDomainEventId,
    facts: { decision },
  } as const;
  await enqueueClaimInboxNotification(tx, {
    ...memberClaimUpdate(args),
    id: `ntf_${notificationDeliveryKey({ ...source, channel: 'in_app' })}`,
    tenantId,
    userId: recipient.id,
    type: decision === 'accepted' ? 'escalation_accepted' : 'escalation_declined',
    title: decision === 'accepted' ? 'Recovery accepted' : 'Recovery declined',
    previewRestricted: false,
  });
  return queueOwnerDeliveryChannels(
    tx,
    {
      ...source,
      claimId,
      tenantId,
      recipientUserId: recipient.id,
      id: randomUUID(),
      channel: 'email',
    },
    recipient.emailVerified
  );
}

export async function enqueueClaimMessageNotification(
  tx: TenantTransaction,
  args: ClaimOwnerEvent & { messageId: string }
) {
  const { tenantId, claimId, recipient, messageId } = args;
  if (!recipient) return [];
  const previewRestricted = recipient.role === ROLES.branch_manager;
  const locale = previewRestricted
    ? await resolveRecipientLocale(tx, tenantId, recipient.id)
    : null;
  const copy = locale && CLAIM_MAIL_COPY[locale].messages.claim_message_to_member.restricted;
  await enqueueClaimInboxNotification(tx, {
    ...memberClaimUpdate(args),
    id: `ntf_new_message_${messageId}`,
    tenantId,
    userId: recipient.id,
    type: 'new_message',
    previewRestricted,
    title: copy ? copy.heading : 'New Message',
    ...(copy && { content: copy.body }),
  });
  return queueOwnerDeliveryChannels(
    tx,
    {
      kind: 'claim_message_to_member',
      claimId,
      messageId,
      facts: { previewRestricted },
      tenantId,
      recipientUserId: recipient.id,
      id: randomUUID(),
      channel: 'email',
    },
    recipient.emailVerified
  );
}
