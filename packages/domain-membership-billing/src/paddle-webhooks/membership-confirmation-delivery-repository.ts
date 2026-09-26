import { withTenantContext } from '@interdomestik/database';
import { engagementEmailSends } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type { MembershipConfirmationDeliveryRepository } from './membership-confirmation-delivery';

export const databaseMembershipConfirmationDeliveryRepository: MembershipConfirmationDeliveryRepository =
  {
    async insertPending(row) {
      return withTenantContext({ tenantId: row.tenantId, role: 'system' }, async tx => {
        // db-access-guard: tenant-scoped -- reason: immutable confirmation snapshot is inserted under canonical webhook tenant context
        const [inserted] = await tx
          .insert(engagementEmailSends)
          .values({
            id: row.id,
            tenantId: row.tenantId,
            userId: row.userId,
            subscriptionId: row.subscriptionId,
            templateKey: 'membership_confirmation_v1',
            dedupeKey: row.dedupeKey,
            status: row.status,
            metadata: row.metadata,
          })
          .onConflictDoNothing({ target: engagementEmailSends.dedupeKey })
          .returning({ id: engagementEmailSends.id });
        return inserted ?? null;
      });
    },

    async find(tenantId, dedupeKey) {
      return withTenantContext({ tenantId, role: 'system' }, async tx => {
        // db-access-guard: tenant-scoped -- reason: confirmation retry reads only the canonical webhook tenant and exact dedupe key
        const [row] = await tx
          .select({
            id: engagementEmailSends.id,
            tenantId: engagementEmailSends.tenantId,
            userId: engagementEmailSends.userId,
            subscriptionId: engagementEmailSends.subscriptionId,
            dedupeKey: engagementEmailSends.dedupeKey,
            status: engagementEmailSends.status,
            providerMessageId: engagementEmailSends.providerMessageId,
            error: engagementEmailSends.error,
            metadata: engagementEmailSends.metadata,
          })
          .from(engagementEmailSends)
          .where(
            and(
              eq(engagementEmailSends.tenantId, tenantId),
              eq(engagementEmailSends.dedupeKey, dedupeKey)
            )
          )
          .limit(1);
        return row ?? null;
      });
    },

    async reclaimError(tenantId, dedupeKey) {
      return withTenantContext({ tenantId, role: 'system' }, async tx => {
        // db-access-guard: tenant-scoped -- reason: compare-and-set reclaims only the exact failed tenant delivery
        const rows = await tx
          .update(engagementEmailSends)
          .set({ status: 'pending', error: null })
          .where(
            and(
              eq(engagementEmailSends.tenantId, tenantId),
              eq(engagementEmailSends.dedupeKey, dedupeKey),
              eq(engagementEmailSends.status, 'error')
            )
          )
          .returning({ id: engagementEmailSends.id });
        return rows.length === 1;
      });
    },

    async markReady(tenantId, deliveryId, dedupeKey, subscriptionId) {
      return updateClaimedDelivery(
        tenantId,
        deliveryId,
        dedupeKey,
        { status: 'pending', subscriptionId },
        'authorized'
      );
    },

    async markSent(tenantId, deliveryId, dedupeKey, providerMessageId) {
      return updateClaimedDelivery(tenantId, deliveryId, dedupeKey, {
        status: 'sent',
        providerMessageId,
        sentAt: new Date(),
        error: null,
      });
    },

    async markError(tenantId, deliveryId, dedupeKey, error) {
      return updateClaimedDelivery(tenantId, deliveryId, dedupeKey, {
        status: 'error',
        error,
      });
    },
  };

async function updateClaimedDelivery(
  tenantId: string,
  deliveryId: string,
  dedupeKey: string,
  values: Partial<typeof engagementEmailSends.$inferInsert>,
  expectedStatus = 'pending'
) {
  return withTenantContext({ tenantId, role: 'system' }, async tx => {
    // db-access-guard: tenant-scoped -- reason: compare-and-set completes only the exact claimed tenant delivery
    const rows = await tx
      .update(engagementEmailSends)
      .set(values)
      .where(
        and(
          eq(engagementEmailSends.tenantId, tenantId),
          eq(engagementEmailSends.id, deliveryId),
          eq(engagementEmailSends.dedupeKey, dedupeKey),
          eq(engagementEmailSends.status, expectedStatus)
        )
      )
      .returning({ id: engagementEmailSends.id });
    return rows.length === 1;
  });
}
