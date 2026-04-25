import { db } from '@interdomestik/database';
import { pushSubscriptions } from '@interdomestik/database/schema';
import { pushSubscriptionSchema } from '@interdomestik/domain-communications/notifications/schemas';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type PushSubscriptionBody = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
};

type Audit = {
  action: 'push_subscription.upsert' | 'push_subscription.delete';
  entityType: 'push_subscription';
  entityId: string;
  metadata?: Record<string, unknown>;
};

type CoreSuccessResult = {
  status: 200;
  body: { success: true };
  audit?: Audit;
};

type CoreErrorResult = {
  status: 400 | 409;
  body: { error: string };
};

type CoreResult = CoreSuccessResult | CoreErrorResult;

const PUSH_ENDPOINT_CONFLICT_ERROR = 'Push subscription endpoint already registered';

function pushEndpointConflict(): CoreErrorResult {
  return { status: 409, body: { error: PUSH_ENDPOINT_CONFLICT_ERROR } };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
  );
}

function isOwnedSubscription(
  subscription: { tenantId: string; userId: string },
  tenantId: string,
  userId: string
): boolean {
  return subscription.tenantId === tenantId && subscription.userId === userId;
}

async function findPushSubscriptionByEndpoint(endpoint: string) {
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);

  return existing;
}

async function updatePushSubscription(args: {
  endpoint: string;
  tenantId: string;
  userId: string;
  p256dh: string;
  authKey: string;
  userAgent?: string;
}) {
  const { endpoint, tenantId, userId, p256dh, authKey, userAgent } = args;

  await db
    .update(pushSubscriptions)
    .set({
      tenantId,
      userId,
      endpoint,
      p256dh,
      auth: authKey,
      userAgent,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.tenantId, tenantId),
        eq(pushSubscriptions.userId, userId)
      )
    );
}

export async function upsertPushSubscriptionCore(args: {
  userId: string;
  tenantId?: string | null;
  body: PushSubscriptionBody;
}): Promise<CoreResult> {
  const { userId, tenantId, body } = args;
  if (!tenantId) {
    return { status: 400, body: { error: 'Missing tenantId' } };
  }
  const resolvedTenantId = tenantId;

  const validation = pushSubscriptionSchema.safeParse(body);

  if (!validation.success) {
    return { status: 400, body: { error: 'Invalid subscription data' } };
  }

  const { endpoint, keys, userAgent } = validation.data;
  const { p256dh, auth: authKey } = keys;
  const updateArgs = {
    endpoint,
    tenantId: resolvedTenantId,
    userId,
    p256dh,
    authKey,
    userAgent,
  };

  const existing = await findPushSubscriptionByEndpoint(endpoint);

  if (existing) {
    if (!isOwnedSubscription(existing, resolvedTenantId, userId)) {
      return pushEndpointConflict();
    }

    await updatePushSubscription(updateArgs);
  } else {
    try {
      await db.insert(pushSubscriptions).values({
        id: nanoid(),
        tenantId: resolvedTenantId,
        userId,
        endpoint,
        p256dh,
        auth: authKey,
        userAgent,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const racedExisting = await findPushSubscriptionByEndpoint(endpoint);
      if (!racedExisting || !isOwnedSubscription(racedExisting, resolvedTenantId, userId)) {
        return pushEndpointConflict();
      }

      await updatePushSubscription(updateArgs);
    }
  }

  return {
    status: 200,
    body: { success: true },
    audit: {
      action: 'push_subscription.upsert',
      entityType: 'push_subscription',
      entityId: endpoint,
      metadata: {
        userAgent,
      },
    },
  };
}

export async function deletePushSubscriptionCore(args: {
  userId: string;
  tenantId?: string | null;
  endpoint: string;
}): Promise<{ status: 200 | 400; body: { success?: true; error?: string }; audit?: Audit }> {
  const { endpoint, tenantId, userId } = args;
  if (!tenantId) {
    return { status: 400, body: { error: 'Missing tenantId' } };
  }
  const resolvedTenantId = tenantId;

  if (!endpoint) {
    return { status: 400, body: { error: 'Invalid subscription' } };
  }

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.tenantId, resolvedTenantId),
        eq(pushSubscriptions.userId, userId)
      )
    );

  return {
    status: 200,
    body: { success: true },
    audit: {
      action: 'push_subscription.delete',
      entityType: 'push_subscription',
      entityId: endpoint,
    },
  };
}
