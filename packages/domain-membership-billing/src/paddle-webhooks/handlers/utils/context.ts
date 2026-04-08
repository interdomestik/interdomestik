import { db } from '@interdomestik/database';
import { findSubscriptionByProviderReference } from '../../../subscription';

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
    if (agent?.branchId) {
      return agent.branchId;
    }
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
    | {
        userId?: string;
        agentId?: string;
        tenantId?: string;
        acquisitionSource?: string;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmContent?: string;
      }
    | undefined;

  const existingSub = await findSubscriptionByProviderReference(sub.id);
  const userId = customData?.userId ?? existingSub?.userId;

  if (!userId) {
    console.warn(`[Webhook] No userId found in customData for subscription ${sub.id}`);
    return null;
  }

  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: { tenantId: true, email: true, name: true, memberNumber: true },
  });

  const canonicalTenantId = existingSub?.tenantId ?? userRecord?.tenantId;
  const tenantId = canonicalTenantId ?? customData?.tenantId;

  if (canonicalTenantId && customData?.tenantId && customData.tenantId !== canonicalTenantId) {
    console.warn(
      `[Webhook] Ignoring mismatched customData.tenantId for subscription ${sub.id} userId=${userId}; canonical tenant=${canonicalTenantId} customData tenant=${customData.tenantId}`
    );
  }

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
