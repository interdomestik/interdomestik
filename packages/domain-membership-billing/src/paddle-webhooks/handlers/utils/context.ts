import { db } from '@interdomestik/database';

export async function resolveBranchId(args: {
  customData: { agentId?: string } | undefined;
  tenantId: string;
  db: typeof db;
}): Promise<string | undefined> {
  const { customData, tenantId, db: database } = args;

  // 1. Prefer Agent's Branch
  if (customData?.agentId) {
    const agent = await database.query.user.findFirst({
      where: (u, { and, eq }) => and(eq(u.id, customData.agentId!), eq(u.tenantId, tenantId)),
      columns: { branchId: true },
    });
    return agent?.branchId || undefined;
  }

  // 2. Fallback to Tenant Default Branch
  const defaultBranchSetting = await database.query.tenantSettings.findFirst({
    where: (ts, { and, eq }) =>
      and(eq(ts.tenantId, tenantId), eq(ts.category, 'rbac'), eq(ts.key, 'default_branch_id')),
    columns: { value: true },
  });

  const value = defaultBranchSetting?.value as unknown;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      (typeof obj.branchId === 'string' && obj.branchId) ||
      (typeof obj.defaultBranchId === 'string' && obj.defaultBranchId) ||
      (typeof obj.id === 'string' && obj.id) ||
      (typeof obj.value === 'string' && obj.value) ||
      undefined
    );
  }
  return undefined;
}

export async function resolveSubscriptionContext(sub: any) {
  const customData = (sub.customData || sub.custom_data) as
    | { userId?: string; agentId?: string }
    | undefined;
  const userId = customData?.userId;

  if (!userId) {
    console.warn(`[Webhook] No userId found in customData for subscription ${sub.id}`);
    return null;
  }

  const existingSub = await db.query.subscriptions.findFirst({
    where: (subs, { eq }) => eq(subs.id, sub.id),
    columns: { tenantId: true },
  });

  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: { tenantId: true, email: true, name: true, memberNumber: true },
  });

  const tenantId = existingSub?.tenantId ?? userRecord?.tenantId;

  if (!tenantId) {
    console.warn(
      `[Webhook] Cannot resolve tenant for subscription ${sub.id} userId=${userId}; skipping write`
    );
    return null;
  }

  const branchId = await resolveBranchId({
    customData,
    tenantId,
    db: db,
  });

  return { userId, tenantId, branchId, customData, userRecord, existingSub };
}
