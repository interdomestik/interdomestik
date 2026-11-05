import {
  and,
  eq,
  serviceUsage,
  sql,
  subscriptions,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import {
  buildMatterAllowanceWindow,
  resolveMatterAllowance,
  type NormalizableDate,
} from './matter-allowance-window';

export {
  buildMatterAllowanceWindow,
  FAMILY_MATTER_ALLOWANCE,
  STANDARD_MATTER_ALLOWANCE,
} from './matter-allowance-window';

export const RECOVERY_MATTER_SERVICE_CODE_PREFIX = 'staff_recovery_matter:';
const RECOVERY_MATTER_SERVICE_CODE_PATTERN = `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}%`;

export type MatterAllowanceVisibility = {
  allowanceTotal: number;
  consumedCount: number;
  remainingCount: number;
  windowStart: Date;
  windowEnd: Date;
};

export type MatterAllowanceContext = MatterAllowanceVisibility & {
  subscriptionId: string;
};

export type MatterAllowanceSubscriptionContext = {
  currentPeriodEnd: NormalizableDate;
  currentPeriodStart: NormalizableDate;
  planId: string | null | undefined;
  subscriptionId: string;
};

// A caller either runs inside a tenant transaction it already opened (tx plus the tenant it
// scopes predicates to), or hands over the request's tenant authority so the read opens its own.
export type MatterAllowanceScope =
  | { authority?: undefined; tenantId: string; tx: TenantTransaction }
  | { authority: TenantAuthority; tenantId?: undefined; tx?: undefined };

function scopeTenantId(scope: MatterAllowanceScope): string {
  return scope.tx ? scope.tenantId : readTenantAuthority(scope.authority).tenantId;
}

function withTenantExecutor<T>(
  scope: MatterAllowanceScope,
  action: (executor: TenantTransaction) => Promise<T>
): Promise<T> {
  return scope.tx ? action(scope.tx) : withTenantAuthority(scope.authority, action);
}

export function getRecoveryMatterServiceCode(claimId: string) {
  return `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}${claimId}`;
}

export async function hasRecoveryMatterUsageForClaim(
  params: MatterAllowanceScope & {
    claimId: string;
    subscriptionId: string;
  }
) {
  const tenantId = scopeTenantId(params);
  const [existingUsage] = await withTenantExecutor(params, executor =>
    executor
      .select({ id: serviceUsage.id })
      .from(serviceUsage)
      .where(
        withTenant(
          tenantId,
          serviceUsage.tenantId,
          and(
            eq(serviceUsage.subscriptionId, params.subscriptionId),
            eq(serviceUsage.serviceCode, getRecoveryMatterServiceCode(params.claimId))
          )
        )
      )
      .limit(1)
  );

  return !!existingUsage;
}

type UsageWindow = {
  lockUsage?: boolean;
  end: Date;
  start: Date;
  subscriptionId: string;
};

export async function countRecoveryMatterUsageInWindow(
  params: MatterAllowanceScope & {
    lockUsage?: boolean;
    end: Date;
    start: Date;
    subscriptionId: string;
  }
) {
  const tenantId = scopeTenantId(params);
  if (params.lockUsage !== false)
    await params.tx?.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['recovery', tenantId, params.subscriptionId])}, 0))`
    );
  const endBoundary = params.end.toISOString();
  const startBoundary = params.start.toISOString();
  const [usageCount] = await withTenantExecutor(params, executor =>
    executor
      .select({ count: sql<number>`count(*)` })
      .from(serviceUsage)
      .where(
        withTenant(
          tenantId,
          serviceUsage.tenantId,
          and(
            eq(serviceUsage.subscriptionId, params.subscriptionId),
            sql`${serviceUsage.serviceCode} like ${RECOVERY_MATTER_SERVICE_CODE_PATTERN}`,
            sql`${serviceUsage.usedAt} >= CAST(${startBoundary} AS timestamp)`,
            sql`${serviceUsage.usedAt} <= CAST(${endBoundary} AS timestamp)`
          )
        )
      )
      .limit(1)
  );

  return Number(usageCount?.count ?? 0);
}

// The scope's transaction is passed as an explicit field of a fresh argument, never copied out.
async function countUsageInWindow(scope: MatterAllowanceScope, window: UsageWindow) {
  const { lockUsage, end, start, subscriptionId } = window;
  if (scope.tx) {
    return await countRecoveryMatterUsageInWindow({
      tenantId: scope.tenantId,
      tx: scope.tx,
      lockUsage,
      end,
      start,
      subscriptionId,
    });
  }
  return await countRecoveryMatterUsageInWindow({
    authority: scope.authority,
    lockUsage,
    end,
    start,
    subscriptionId,
  });
}

export function getMatterAllowanceSubscriptionContextForUser(
  params: MatterAllowanceScope & {
    userId: string;
  }
): Promise<MatterAllowanceSubscriptionContext | null> {
  return subscriptionContextForUser(params, params.userId);
}

async function subscriptionContextForUser(
  scope: MatterAllowanceScope,
  userId: string
): Promise<MatterAllowanceSubscriptionContext | null> {
  const tenantId = scopeTenantId(scope);
  const [subscription] = await withTenantExecutor(scope, executor =>
    executor
      .select({
        id: subscriptions.id,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        currentPeriodStart: subscriptions.currentPeriodStart,
        planId: subscriptions.planId,
      })
      .from(subscriptions)
      .where(withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, userId)))
      .limit(1)
  );

  if (!subscription) return null;

  const { id: subscriptionId, ...context } = subscription;
  return { subscriptionId, ...context };
}

type AllowanceRequest = {
  lockUsage?: boolean;
  now?: Date;
};

export function getMatterAllowanceContextForSubscription(
  params: MatterAllowanceScope &
    AllowanceRequest & {
      subscription: MatterAllowanceSubscriptionContext;
    }
): Promise<MatterAllowanceContext> {
  return allowanceContextForSubscription(params, params.subscription, {
    lockUsage: params.lockUsage,
    now: params.now,
  });
}

async function allowanceContextForSubscription(
  scope: MatterAllowanceScope,
  subscription: MatterAllowanceSubscriptionContext,
  request: AllowanceRequest
): Promise<MatterAllowanceContext> {
  const allowanceWindow = buildMatterAllowanceWindow({
    currentPeriodEnd: subscription.currentPeriodEnd,
    currentPeriodStart: subscription.currentPeriodStart,
    now: request.now ?? new Date(),
  });
  const allowanceTotal = resolveMatterAllowance(subscription.planId);
  const consumedCount = await countUsageInWindow(scope, {
    lockUsage: request.lockUsage,
    end: allowanceWindow.end,
    start: allowanceWindow.start,
    subscriptionId: subscription.subscriptionId,
  });

  return {
    subscriptionId: subscription.subscriptionId,
    allowanceTotal,
    consumedCount,
    remainingCount: Math.max(allowanceTotal - consumedCount, 0),
    windowStart: allowanceWindow.start,
    windowEnd: allowanceWindow.end,
  };
}

export function getMatterAllowanceContextForUser(
  params: MatterAllowanceScope &
    AllowanceRequest & {
      userId: string;
    }
): Promise<MatterAllowanceContext | null> {
  return allowanceContextForUser(params, params.userId, {
    lockUsage: params.lockUsage,
    now: params.now,
  });
}

async function allowanceContextForUser(
  scope: MatterAllowanceScope,
  userId: string,
  request: AllowanceRequest
): Promise<MatterAllowanceContext | null> {
  const subscription = await subscriptionContextForUser(scope, userId);

  if (!subscription) return null;

  return allowanceContextForSubscription(scope, subscription, request);
}

export async function getMatterAllowanceVisibilityForUser(
  params: MatterAllowanceScope & {
    userId: string;
    now?: Date;
  }
): Promise<MatterAllowanceVisibility | null> {
  // Visibility is advisory; only allowance-consuming workflows need the write lock.
  const context = await allowanceContextForUser(params, params.userId, {
    lockUsage: false,
    now: params.now,
  });

  if (!context) return null;

  const { subscriptionId: _id, ...visibility } = context;
  return visibility;
}
