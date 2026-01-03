import { db } from '@interdomestik/database';
import { pushSubscriptions } from '@interdomestik/database/schema';
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

export async function upsertPushSubscriptionCore(args: {
  userId: string;
  tenantId?: string | null;
  body: PushSubscriptionBody;
}): Promise<{ status: 200 | 400; body: { success?: true; error?: string }; audit?: Audit }> {
  const { userId, tenantId, body } = args;
  if (!tenantId) {
    return { status: 400, body: { error: 'Missing tenantId' } };
  }
  const resolvedTenantId = tenantId;

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const authKey = body?.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    return { status: 400, body: { error: 'Invalid subscription' } };
  }

  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        tenantId: resolvedTenantId,
        userId,
        endpoint,
        p256dh,
        auth: authKey,
        userAgent: body.userAgent,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptions).values({
      id: nanoid(),
      tenantId: resolvedTenantId,
      userId,
      endpoint,
      p256dh,
      auth: authKey,
      userAgent: body.userAgent,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return {
    status: 200,
    body: { success: true },
    audit: {
      action: 'push_subscription.upsert',
      entityType: 'push_subscription',
      entityId: endpoint,
      metadata: {
        userAgent: body.userAgent,
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
