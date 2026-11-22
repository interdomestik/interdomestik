import type { TenantTransaction } from '@interdomestik/database';
import { auditLog } from '@interdomestik/database/schema';
import { randomUUID } from 'node:crypto';
import { CLAIM_MAIL_COPY } from '../claim-mail';
import { enqueueClaimInboxNotification } from './in-app';
import { notificationDeliveryKey } from './keys';
import { enqueueNotificationDelivery } from './store';

type ClaimScope = { tenantId: string; claimId: string };
type StaffRecipient = {
  id: string;
  emailVerified: boolean;
};
type StaffSource =
  { kind: 'staff_claim_submitted' } | { kind: 'staff_member_message'; messageId: string };

type StaffClaim = ClaimScope & { claimNumber: string | null; category: string };

async function queueStaffRecipient(
  tx: TenantTransaction,
  claim: StaffClaim,
  source: StaffSource,
  recipient: StaffRecipient,
  ids: string[]
): Promise<void> {
  const { tenantId, claimId, claimNumber, category } = claim;
  const routed = { ...source, claimId, tenantId, recipientUserId: recipient.id };
  await enqueueClaimInboxNotification(tx, {
    id: `ntf_${notificationDeliveryKey({ ...routed, channel: 'in_app' })}`,
    tenantId,
    userId: recipient.id,
    type: source.kind,
    title: claimNumber ?? '—',
    content: Object.hasOwn(CLAIM_MAIL_COPY.en.categories, category) ? category : 'other',
    actionUrl: `/staff/claims/${claimId}`,
  });
  if (recipient.emailVerified) {
    const id = await enqueueNotificationDelivery(tx, {
      ...routed,
      id: randomUUID(),
      channel: 'email',
    });
    if (id) ids.push(id);
  }
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

  const ids: string[] = [];
  for await (const recipient of recipients) {
    await queueStaffRecipient(tx, claim, source, recipient, ids);
  }
  return ids;
}
