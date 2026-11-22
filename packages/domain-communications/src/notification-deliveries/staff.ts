import type { TenantTransaction } from '@interdomestik/database';
import { auditLog } from '@interdomestik/database/schema';
import { randomUUID } from 'node:crypto';
import { EN_COPY } from '../claim-mail/copy-en';
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

export async function enqueueStaffClaimNotification(
  tx: TenantTransaction,
  claim: ClaimScope & { claimNumber: string | null; category: string },
  source: StaffSource,
  recipients: readonly StaffRecipient[]
) {
  const { tenantId, claimId, claimNumber, category } = claim;
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
  for (const recipient of recipients) {
    const routed = { ...source, claimId, tenantId, recipientUserId: recipient.id };
    await enqueueClaimInboxNotification(tx, {
      id: `ntf_${notificationDeliveryKey({ ...routed, channel: 'in_app' })}`,
      tenantId,
      userId: recipient.id,
      type: source.kind,
      title: claimNumber ?? '—',
      content: Object.hasOwn(EN_COPY.categories, category) ? category : 'other',
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
  return ids;
}
