import { db } from '@interdomestik/database';
import { findSubscriptionByProviderReference } from '../../../subscription';

export class PaddleSubscriptionContextConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleSubscriptionContextConflictError';
  }
}

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
  const customDataUserId = normalizeText(customData?.userId);
  const customDataTenantId = normalizeText(customData?.tenantId);
  const existingUserId = normalizeText(existingSub?.userId);
  const existingTenantId = normalizeText(existingSub?.tenantId);
  const userId = existingUserId ?? customDataUserId;

  if (!userId) {
    console.warn(`[Webhook] No userId found in customData for subscription ${sub.id}`);
    return null;
  }

  if (existingUserId && customDataUserId && customDataUserId !== existingUserId) {
    throw new PaddleSubscriptionContextConflictError(
      `Cannot resolve subscription ${sub.id}; customData user=${customDataUserId} conflicts with existing subscription user=${existingUserId}`
    );
  }

  // db-access-guard: tenant-scoped -- reason: userId resolved from canonical subscription or verified user lookup boundary
  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: { tenantId: true, email: true, name: true, memberNumber: true, agentId: true },
  });

  if (!userRecord) {
    console.warn(
      `[Webhook] Cannot resolve subscription ${sub.id}; canonical user ${userId} was not found`
    );
    return null;
  }

  if (existingTenantId && userRecord.tenantId !== existingTenantId) {
    throw new PaddleSubscriptionContextConflictError(
      `Cannot resolve subscription ${sub.id}; existing subscription tenant=${existingTenantId} conflicts with user tenant=${userRecord.tenantId}`
    );
  }

  const tenantId = existingTenantId ?? userRecord.tenantId;

  if (customDataTenantId && customDataTenantId !== tenantId) {
    throw new PaddleSubscriptionContextConflictError(
      `Cannot resolve subscription ${sub.id}; customData tenant=${customDataTenantId} conflicts with canonical tenant=${tenantId}`
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

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
