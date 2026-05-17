import { withTenantContext } from '@interdomestik/database';
import { engagementEmailSends } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function createPendingEngagementSend(args: {
  tenantId: string;
  userId: string;
  subscriptionId: string;
  templateKey: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
}) {
  const { tenantId, userId, subscriptionId, templateKey, dedupeKey, metadata } = args;

  return await withTenantContext({ tenantId, role: 'system' }, tx =>
    tx
      .insert(engagementEmailSends)
      .values({
        id: nanoid(),
        tenantId,
        userId,
        subscriptionId,
        templateKey,
        dedupeKey,
        status: 'pending',
        createdAt: new Date(),
        metadata,
      })
      .onConflictDoNothing({ target: engagementEmailSends.dedupeKey })
      .returning({ id: engagementEmailSends.id })
  );
}

export async function updateEngagementSend(
  tenantId: string,
  dedupeKey: string,
  values: Partial<typeof engagementEmailSends.$inferInsert>
) {
  await withTenantContext({ tenantId, role: 'system' }, async tx => {
    await tx
      .update(engagementEmailSends)
      .set(values)
      .where(
        and(
          eq(engagementEmailSends.dedupeKey, dedupeKey),
          eq(engagementEmailSends.tenantId, tenantId)
        )
      );
  });
}
