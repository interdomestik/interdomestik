import { db } from '@interdomestik/database';

import { findSubscriptionByProviderReference } from '../../subscription';
import { RetryablePaddleWebhookError } from '../errors';
import { subscriptionEventDataSchema } from '../schemas';

type SubscriptionEventData = ReturnType<typeof subscriptionEventDataSchema.parse>;

export type PastDueUserRecord = {
  id: string;
  email: string | null;
  name: string | null;
  tenantId: string;
};

export type ExistingSubscriptionRecord = {
  id: string;
  tenantId: string;
  userId: string;
  dunningAttemptCount?: number | null;
  pastDueAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
} | null;

export async function resolvePastDueContext(
  sub: SubscriptionEventData,
  options: { requireExactProviderRow: boolean; tenantId?: string | null }
): Promise<{
  userRecord: PastDueUserRecord;
  existingSub: ExistingSubscriptionRecord;
} | null> {
  const customData = sub.customData || sub.custom_data;
  const customDataUserId = normalizeText(customData?.userId);
  const customDataTenantId = normalizeText(customData?.tenantId);
  const canonicalTenantId = normalizeText(options.tenantId);
  if (options.requireExactProviderRow && !canonicalTenantId) {
    throw new RetryablePaddleWebhookError(
      `Entity past_due for ${sub.id} requires a canonical tenant`
    );
  }
  const existingSub = await findExistingPastDueSubscriptionByProvider(
    sub.id,
    options.requireExactProviderRow ? canonicalTenantId : null
  );
  if (options.requireExactProviderRow && !existingSub) {
    throw new RetryablePaddleWebhookError(
      `Entity past_due for ${sub.id} requires an existing provider subscription row`
    );
  }
  const existingUserId = normalizeText(existingSub?.userId);
  const existingTenantId = normalizeText(existingSub?.tenantId);
  const userId = existingUserId ?? customDataUserId;
  if (!userId) {
    console.warn(`[Webhook] No canonical userId found for past_due subscription ${sub.id}`);
    return null;
  }
  if (existingUserId && customDataUserId && customDataUserId !== existingUserId) {
    console.warn(
      `[Webhook] Cannot resolve past_due subscription ${sub.id}; customData user=${customDataUserId} conflicts with existing subscription user=${existingUserId}`
    );
    return null;
  }

  const userRecord = await findPastDueUserRecord(userId);
  if (!userRecord) {
    console.warn(`[Webhook] User not found: ${userId}`);
    return null;
  }
  if (existingTenantId && existingTenantId !== userRecord.tenantId) {
    console.warn(
      `[Webhook] Cannot resolve past_due subscription ${sub.id}; existing subscription tenant=${existingTenantId} conflicts with user tenant=${userRecord.tenantId}`
    );
    return null;
  }
  if (customDataTenantId && customDataTenantId !== userRecord.tenantId) {
    console.warn(
      `[Webhook] Cannot resolve past_due subscription ${sub.id}; customData tenant=${customDataTenantId} conflicts with canonical tenant=${userRecord.tenantId}`
    );
    return null;
  }

  return {
    userRecord,
    existingSub: existingSub ?? (await findExistingPastDueSubscriptionForUser(userRecord)),
  };
}

async function findPastDueUserRecord(userId: string): Promise<PastDueUserRecord | null> {
  return (
    // db-access-guard: system-exempt -- reason: Paddle userId lookup bootstraps dunning tenant context before tenant-scoped writes
    (await db.query.user.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      columns: { id: true, email: true, name: true, tenantId: true },
    })) ?? null
  );
}

async function findExistingPastDueSubscriptionByProvider(
  subscriptionId: string,
  tenantId: string | null
): Promise<ExistingSubscriptionRecord> {
  return (
    (await findSubscriptionByProviderReference(
      subscriptionId,
      tenantId ? { tenantId } : undefined
    )) ?? null
  );
}

export async function findExistingPastDueSubscriptionForUser(
  userRecord: Pick<PastDueUserRecord, 'id' | 'tenantId'>
): Promise<ExistingSubscriptionRecord> {
  return (
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical user record constrains fallback subscription lookup
    (await db.query.subscriptions.findFirst({
      where: (subs, { and, eq }) =>
        and(eq(subs.userId, userRecord.id), eq(subs.tenantId, userRecord.tenantId)),
    })) ?? null
  );
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
