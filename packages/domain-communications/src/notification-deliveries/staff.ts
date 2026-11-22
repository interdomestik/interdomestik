import type { TenantTransaction } from '@interdomestik/database';
import { auditLog, claims, user } from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { EN_COPY } from '../claim-mail/copy-en';
import { enqueueClaimInboxNotification } from './in-app';
import { notificationDeliveryKey } from './keys';
import { enqueueNotificationDelivery } from './store';
import type { DeliveryDependencies } from './types';

type ClaimScope = { tenantId: string; claimId: string };
type StaffRecipient = {
  id: string;
  role: string | null;
  branchId: string | null;
  emailVerified: boolean;
};
type StaffSource =
  { kind: 'staff_claim_submitted' } | { kind: 'staff_member_message'; messageId: string };

export async function canReceiveStaffClaimNotification(
  tx: TenantTransaction,
  claim: ClaimScope,
  recipient: Pick<StaffRecipient, 'id' | 'role' | 'branchId'>,
  buildStaffClaimScope: DeliveryDependencies['buildStaffClaimScope']
) {
  if (recipient.role === ROLES.tenant_admin) return true;
  if (recipient.role !== ROLES.staff) return false;
  const scope = buildStaffClaimScope({
    role: ROLES.staff,
    claimId: claim.claimId,
    userId: recipient.id,
    branchId: recipient.branchId,
  });
  if (!scope) return false;
  const [inScope] = await tx
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.tenantId, claim.tenantId), eq(claims.id, claim.claimId), scope));
  return Boolean(inScope);
}

export async function resolveStaffClaimNotificationRecipients(
  tx: TenantTransaction,
  claim: ClaimScope & { staffId: string | null },
  buildStaffClaimScope: DeliveryDependencies['buildStaffClaimScope']
): Promise<StaffRecipient[]> {
  const users = await tx
    .select({
      id: user.id,
      role: user.role,
      branchId: user.branchId,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(
      and(
        eq(user.tenantId, claim.tenantId),
        or(
          eq(user.role, ROLES.staff),
          eq(user.role, ROLES.tenant_admin),
          claim.staffId ? eq(user.id, claim.staffId) : undefined
        )
      )
    )
    .orderBy(user.id)
    .for('share');

  const scopedStaff: StaffRecipient[] = [];
  const staffScope = { tenantId: claim.tenantId, claimId: claim.claimId };
  for (const recipient of users) {
    if (
      recipient.role === ROLES.staff &&
      (await canReceiveStaffClaimNotification(tx, staffScope, recipient, buildStaffClaimScope))
    ) {
      scopedStaff.push(recipient);
    }
  }
  const assignee = scopedStaff.find(recipient => recipient.id === claim.staffId);
  if (assignee) return [assignee];
  if (scopedStaff.length > 0) return scopedStaff;
  return users.filter(recipient => recipient.role === ROLES.tenant_admin);
}

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
