import type { TenantTransaction } from '@interdomestik/database';
import { auditLog } from '@interdomestik/database/schema';
import { randomUUID } from 'node:crypto';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import { enqueueClaimInboxNotifications } from './in-app';
import { notificationDeliveryKey } from './keys';
import { enqueueNotificationDeliveries } from './store';

type ClaimScope = { tenantId: string; claimId: string };
type StaffRecipient = {
  id: string;
  emailVerified: boolean;
};
type StaffSource =
  { kind: 'staff_claim_submitted' } | { kind: 'staff_member_message'; messageId: string };

type StaffClaim = ClaimScope & { claimNumber: string | null; category: string };

function routedTo(claim: StaffClaim, source: StaffSource, recipient: StaffRecipient) {
  return {
    ...source,
    claimId: claim.claimId,
    tenantId: claim.tenantId,
    recipientUserId: recipient.id,
  };
}

function inboxRow(claim: StaffClaim, source: StaffSource, recipient: StaffRecipient) {
  const { tenantId, claimId, claimNumber, category } = claim;
  const routed = routedTo(claim, source, recipient);
  return {
    id: `ntf_${notificationDeliveryKey({ ...routed, channel: 'in_app' })}`,
    tenantId,
    userId: recipient.id,
    type: source.kind,
    title: claimNumber ?? '—',
    content: Object.hasOwn(CLAIM_MAIL_COPY.en.categories, category) ? category : 'other',
    actionUrl: `/staff/claims/${claimId}`,
    previewRestricted: false,
  };
}

function emailDelivery(claim: StaffClaim, source: StaffSource, recipient: StaffRecipient) {
  return { ...routedTo(claim, source, recipient), id: randomUUID(), channel: 'email' as const };
}

export async function enqueueStaffClaimNotification(
  tx: TenantTransaction,
  claim: StaffClaim,
  source: StaffSource,
  recipients: readonly StaffRecipient[]
) {
  const { tenantId, claimId } = claim;
  if (recipients.length === 0) {
    await tx.insert(auditLog).values({
      id: randomUUID(),
      tenantId,
      action: 'notification.unrouted',
      entityType: 'claim',
      entityId: claimId,
      metadata: { kind: source.kind },
    });
    return [];
  }

  // One statement per table: every recipient keeps its own key and conflict handling.
  await enqueueClaimInboxNotifications(
    tx,
    recipients.map(recipient => inboxRow(claim, source, recipient))
  );
  return enqueueNotificationDeliveries(
    tx,
    recipients
      .filter(recipient => recipient.emailVerified)
      .map(recipient => emailDelivery(claim, source, recipient))
  );
}
