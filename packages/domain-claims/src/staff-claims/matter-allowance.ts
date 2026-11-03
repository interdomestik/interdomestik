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

export const FAMILY_MATTER_ALLOWANCE = 5;
export const STANDARD_MATTER_ALLOWANCE = 2;
export const RECOVERY_MATTER_SERVICE_CODE_PREFIX = 'staff_recovery_matter:';
const RECOVERY_MATTER_SERVICE_CODE_PATTERN = `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}%`;

type NormalizableDate = Date | string | null | undefined;

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

function pickScope(scope: MatterAllowanceScope): MatterAllowanceScope {
  return scope.tx ? { tenantId: scope.tenantId, tx: scope.tx } : { authority: scope.authority };
}

function withTenantExecutor<T>(
  scope: MatterAllowanceScope,
  action: (executor: TenantTransaction) => Promise<T>
): Promise<T> {
  return scope.tx ? action(scope.tx) : withTenantAuthority(scope.authority, action);
}

function normalizeDate(value: NormalizableDate) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildMatterAllowanceWindow(params: {
  currentPeriodEnd: NormalizableDate;
  currentPeriodStart: NormalizableDate;
  now: Date;
}) {
  const currentPeriodStart = normalizeDate(params.currentPeriodStart);
  const currentPeriodEnd = normalizeDate(params.currentPeriodEnd);

  if (currentPeriodStart && currentPeriodEnd) {
    return { end: currentPeriodEnd, start: currentPeriodStart };
  }

  const fallbackEnd = currentPeriodEnd ?? params.now;
  const fallbackStart =
    currentPeriodStart ??
    new Date(
      Date.UTC(
        fallbackEnd.getUTCFullYear() - 1,
        fallbackEnd.getUTCMonth(),
        fallbackEnd.getUTCDate()
      )
    );

  return { end: fallbackEnd, start: fallbackStart };
}

function resolveMatterAllowance(planId: string | null | undefined) {
  return planId === 'family' || planId === 'business'
    ? FAMILY_MATTER_ALLOWANCE
    : STANDARD_MATTER_ALLOWANCE;
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

export async function getMatterAllowanceSubscriptionContextForUser(
  params: MatterAllowanceScope & {
    userId: string;
  }
): Promise<MatterAllowanceSubscriptionContext | null> {
  const tenantId = scopeTenantId(params);
  const [subscription] = await withTenantExecutor(params, executor =>
    executor
      .select({
        id: subscriptions.id,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        currentPeriodStart: subscriptions.currentPeriodStart,
        planId: subscriptions.planId,
      })
      .from(subscriptions)
      .where(withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, params.userId)))
      .limit(1)
  );

  if (!subscription) return null;

  const { id: subscriptionId, ...context } = subscription;
  return { subscriptionId, ...context };
}

export async function getMatterAllowanceContextForSubscription(
  params: MatterAllowanceScope & {
    lockUsage?: boolean;
    now?: Date;
    subscription: MatterAllowanceSubscriptionContext;
  }
): Promise<MatterAllowanceContext> {
  const { subscription } = params;

  const allowanceWindow = buildMatterAllowanceWindow({
    currentPeriodEnd: subscription.currentPeriodEnd,
    currentPeriodStart: subscription.currentPeriodStart,
    now: params.now ?? new Date(),
  });
  const allowanceTotal = resolveMatterAllowance(subscription.planId);
  const consumedCount = await countRecoveryMatterUsageInWindow({
    ...pickScope(params),
    lockUsage: params.lockUsage,
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

export async function getMatterAllowanceContextForUser(
  params: MatterAllowanceScope & {
    lockUsage?: boolean;
    userId: string;
    now?: Date;
  }
): Promise<MatterAllowanceContext | null> {
  const subscription = await getMatterAllowanceSubscriptionContextForUser({
    ...pickScope(params),
    userId: params.userId,
  });

  if (!subscription) return null;

  return getMatterAllowanceContextForSubscription({
    ...pickScope(params),
    lockUsage: params.lockUsage,
    now: params.now,
    subscription,
  });
}

export async function getMatterAllowanceVisibilityForUser(
  params: MatterAllowanceScope & {
    userId: string;
    now?: Date;
  }
): Promise<MatterAllowanceVisibility | null> {
  // Visibility is advisory; only allowance-consuming workflows need the write lock.
  const context = await getMatterAllowanceContextForUser({
    ...pickScope(params),
    lockUsage: false,
    now: params.now,
    userId: params.userId,
  });

  if (!context) return null;

  const { subscriptionId: _id, ...visibility } = context;
  return visibility;
}
