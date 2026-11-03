import {
  authorizePaddleTenant,
  db,
  resolvePaddleUserOwner,
  type TenantTransaction,
} from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { readPaddleCanonicalUser, type PaddleCanonicalUser } from './canonical-user';
import {
  findPaddleSubscriptionByReference,
  type PaddleSubscriptionLookup,
} from '../../../subscription';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export class PaddleSubscriptionContextConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleSubscriptionContextConflictError';
  }
}

export async function resolveBranchId(args: {
  customData: { agentId?: string } | undefined;
  tenantId: string;
  db: typeof db | TenantTransaction;
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

type SubscriptionContextCustomData = {
  userId?: string;
  agentId?: string;
  tenantId?: string;
  acquisitionSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

export type ResolvedSubscriptionContext = {
  userId: string;
  tenantId: string;
  branchId: string | undefined;
  customData: SubscriptionContextCustomData | undefined;
  userRecord: PaddleCanonicalUser;
  existingSub: PaddleSubscriptionLookup['subscription'] | undefined;
  /** The `paddle-webhook` authority every later effect on this tenant runs under. */
  authority: TenantAuthority;
};

export async function resolveSubscriptionContext(
  delivery: IngressCapability<'paddle-delivery'>,
  sub: any
): Promise<ResolvedSubscriptionContext | null> {
  const customData = (sub.customData || sub.custom_data) as
    SubscriptionContextCustomData | undefined;

  const existingLookup = await findPaddleSubscriptionByReference(sub.id, delivery);
  const existingSub = existingLookup?.subscription;
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

  const userLookup = await readPaddleCanonicalUser(delivery, userId);

  if (!userLookup) {
    console.warn(
      `[Webhook] Cannot resolve subscription ${sub.id}; canonical user ${userId} was not found`
    );
    return null;
  }
  const userRecord = userLookup.user;

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

  // The subscription's own authority when it exists, otherwise the user's. Both were minted from
  // resolver owners; a record whose tenant differs from the authority never gets a second one.
  const authority = existingLookup?.authority ?? userLookup.authority;
  assertAuthorityTenant(authority, tenantId, sub.id);

  const branchId = await withTenantAuthority(authority, tx =>
    resolveBranchId({
      customData,
      tenantId,
      db: tx,
    })
  );

  return { userId, tenantId, branchId, customData, userRecord, existingSub, authority };
}

export function assertAuthorityTenant(
  authority: TenantAuthority,
  tenantId: string,
  subscriptionId: string
): void {
  const authorityTenantId = readTenantAuthority(authority).tenantId;
  if (authorityTenantId !== tenantId) {
    throw new PaddleSubscriptionContextConflictError(
      `Cannot resolve subscription ${subscriptionId}; resolved tenant=${tenantId} conflicts with webhook authority tenant=${authorityTenantId}`
    );
  }
}

/**
 * Authority for a user that checkout reconciliation just created or reloaded. The reconciled tenant
 * comes from verified checkout evidence, which has no resolver owner of its own; the persisted user
 * row does. The authority is minted from the resolver owner of that exact user and only when its
 * tenant equals the reconciled tenant.
 */
export async function authorizeReconciledCheckoutUser(
  delivery: IngressCapability<'paddle-delivery'>,
  reconciled: { userId: string; tenantId: string },
  subscriptionId: string
): Promise<TenantAuthority> {
  const owner = await resolvePaddleUserOwner(reconciled.userId);
  if (owner?.userId !== reconciled.userId) {
    throw new PaddleSubscriptionContextConflictError(
      `Cannot resolve subscription ${subscriptionId}; reconciled user ${reconciled.userId} has no unique owner`
    );
  }
  const authority = authorizePaddleTenant(delivery, owner);
  assertAuthorityTenant(authority, reconciled.tenantId, subscriptionId);
  return authority;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
