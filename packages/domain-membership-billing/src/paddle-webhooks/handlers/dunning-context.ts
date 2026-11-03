import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { readPaddleCanonicalUser } from './utils/canonical-user';

import {
  findPaddleSubscriptionByReference,
  findPaddleSubscriptionInTenant,
} from '../../subscription';
import { RetryablePaddleWebhookError } from '../errors';
import { subscriptionEventDataSchema } from '../schemas';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  options: {
    delivery: IngressCapability<'paddle-delivery'>;
    requireExactProviderRow: boolean;
    /** Authority of the canonical tenant the core resolved, when it did. */
    authority?: TenantAuthority | null;
  }
): Promise<{
  userRecord: PastDueUserRecord;
  existingSub: ExistingSubscriptionRecord;
  authority: TenantAuthority;
} | null> {
  const customData = sub.customData || sub.custom_data;
  const customDataUserId = normalizeText(customData?.userId);
  const customDataTenantId = normalizeText(customData?.tenantId);
  const canonicalAuthority = options.authority ?? null;
  if (options.requireExactProviderRow && !canonicalAuthority) {
    throw new RetryablePaddleWebhookError(
      `Entity past_due for ${sub.id} requires a canonical tenant`
    );
  }
  const existingLookup = await findExistingPastDueSubscriptionByProvider(
    sub.id,
    options.delivery,
    options.requireExactProviderRow ? canonicalAuthority : null
  );
  const existingSub = existingLookup?.subscription ?? null;
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

  const userLookup = await findPastDueUserRecord(options.delivery, userId);
  if (!userLookup) {
    console.warn(`[Webhook] User not found: ${userId}`);
    return null;
  }
  const userRecord = userLookup.user;
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

  // The subscription's authority when it exists, otherwise the user's. A tenant that differs from
  // the authority's fails closed before any write.
  const authority = existingLookup?.authority ?? userLookup.authority;
  if (readTenantAuthority(authority).tenantId !== userRecord.tenantId) {
    console.warn(
      `[Webhook] Cannot resolve past_due subscription ${sub.id}; user tenant=${userRecord.tenantId} conflicts with webhook authority tenant=${readTenantAuthority(authority).tenantId}`
    );
    return null;
  }

  return {
    userRecord,
    existingSub:
      existingSub ?? (await findExistingPastDueSubscriptionForUser(authority, userRecord)),
    authority,
  };
}

async function findPastDueUserRecord(
  delivery: IngressCapability<'paddle-delivery'>,
  userId: string
): Promise<{ user: PastDueUserRecord; authority: TenantAuthority } | null> {
  const lookup = await readPaddleCanonicalUser(delivery, userId);
  if (!lookup) return null;
  const { user, authority } = lookup;
  return {
    user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId },
    authority,
  };
}

async function findExistingPastDueSubscriptionByProvider(
  subscriptionId: string,
  delivery: IngressCapability<'paddle-delivery'>,
  authority: TenantAuthority | null
): Promise<{
  subscription: NonNullable<ExistingSubscriptionRecord>;
  authority: TenantAuthority;
} | null> {
  if (authority) {
    const subscription = await findPaddleSubscriptionInTenant(subscriptionId, authority);
    return subscription ? { subscription, authority } : null;
  }
  return findPaddleSubscriptionByReference(subscriptionId, delivery);
}

export async function findExistingPastDueSubscriptionForUser(
  authority: TenantAuthority,
  userRecord: Pick<PastDueUserRecord, 'id' | 'tenantId'>
): Promise<ExistingSubscriptionRecord> {
  const { tenantId } = readTenantAuthority(authority);
  if (userRecord.tenantId !== tenantId) {
    throw new Error(
      `Paddle user ${userRecord.id} tenant conflict: user=${userRecord.tenantId} authority=${tenantId}`
    );
  }
  return (
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical user record constrains fallback subscription lookup
    (await withTenantAuthority(authority, tx =>
      tx.query.subscriptions.findFirst({
        where: (subs, { and, eq }) =>
          and(eq(subs.userId, userRecord.id), eq(subs.tenantId, tenantId)),
      })
    )) ?? null
  );
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
