import {
  and,
  eq,
  serviceUsage,
  sql,
  subscriptions,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

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

// Every read runs inside the tenant transaction its caller already opened, with the tenant that
// transaction's predicates are scoped to. Callers hand the transaction over as an explicit field.
export type MatterAllowanceScope = { tenantId: string; tx: TenantTransaction };

export function getRecoveryMatterServiceCode(claimId: string) {
  return `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}${claimId}`;
}

export async function hasRecoveryMatterUsageForClaim(
  params: MatterAllowanceScope & {
    claimId: string;
    subscriptionId: string;
  }
) {
  const [existingUsage] = await params.tx
    .select({ id: serviceUsage.id })
    .from(serviceUsage)
    .where(
      withTenant(
        params.tenantId,
        serviceUsage.tenantId,
        and(
          eq(serviceUsage.subscriptionId, params.subscriptionId),
          eq(serviceUsage.serviceCode, getRecoveryMatterServiceCode(params.claimId))
        )
      )
    )
    .limit(1);

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
  const { tenantId } = params;
  if (params.lockUsage !== false)
    await params.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['recovery', tenantId, params.subscriptionId])}, 0))`
    );
  const endBoundary = params.end.toISOString();
  const startBoundary = params.start.toISOString();
  const [usageCount] = await params.tx
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
    .limit(1);

  return Number(usageCount?.count ?? 0);
}

// The scope's transaction is passed as an explicit field of a fresh argument, never copied out.
async function countUsageInWindow(scope: MatterAllowanceScope, window: UsageWindow) {
  const { lockUsage, end, start, subscriptionId } = window;
  return await countRecoveryMatterUsageInWindow({
    tenantId: scope.tenantId,
    tx: scope.tx,
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
  const [subscription] = await scope.tx
    .select({
      id: subscriptions.id,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      currentPeriodStart: subscriptions.currentPeriodStart,
      planId: subscriptions.planId,
    })
    .from(subscriptions)
    .where(withTenant(scope.tenantId, subscriptions.tenantId, eq(subscriptions.userId, userId)))
    .limit(1);

  if (!subscription) return null;

  const { id: subscriptionId, ...context } = subscription;
  return { subscriptionId, ...context };
}

type AllowanceRequest = {
  lockUsage?: boolean;
  now?: Date;
};

// Optional request settings travel apart from the scope: a missing field read from the scope
// object would be looked up on its prototype.
export function getMatterAllowanceContextForSubscription(
  params: MatterAllowanceScope & {
    subscription: MatterAllowanceSubscriptionContext;
  },
  request: AllowanceRequest = {}
): Promise<MatterAllowanceContext> {
  return allowanceContextForSubscription(params, params.subscription, request);
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
  },
  request: Pick<AllowanceRequest, 'now'> = {}
): Promise<MatterAllowanceVisibility | null> {
  // Visibility is advisory; only allowance-consuming workflows need the write lock.
  const context = await allowanceContextForUser(params, params.userId, {
    lockUsage: false,
    now: request.now,
  });

  if (!context) return null;

  const { subscriptionId: _id, ...visibility } = context;
  return visibility;
}
