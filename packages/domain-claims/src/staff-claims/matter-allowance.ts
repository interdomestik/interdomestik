import {
  and,
  db,
  eq,
  serviceUsage,
  sql,
  subscriptions,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

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

export async function hasRecoveryMatterUsageForClaim(params: {
  tx?: TenantTransaction;
  claimId: string;
  subscriptionId: string;
  tenantId: string;
}) {
  const [existingUsage] = await (params.tx ?? db)
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

export async function countRecoveryMatterUsageInWindow(params: {
  tx?: TenantTransaction;
  end: Date;
  start: Date;
  subscriptionId: string;
  tenantId: string;
}) {
  await params.tx?.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['recovery', params.tenantId, params.subscriptionId])}, 0))`
  );
  const endBoundary = params.end.toISOString();
  const startBoundary = params.start.toISOString();
  const [usageCount] = await (params.tx ?? db)
    .select({ count: sql<number>`count(*)` })
    .from(serviceUsage)
    .where(
      withTenant(
        params.tenantId,
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

export async function getMatterAllowanceSubscriptionContextForUser(params: {
  tx?: TenantTransaction;
  tenantId: string;
  userId: string;
}): Promise<MatterAllowanceSubscriptionContext | null> {
  const [subscription] = await (params.tx ?? db)
    .select({
      id: subscriptions.id,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      currentPeriodStart: subscriptions.currentPeriodStart,
      planId: subscriptions.planId,
    })
    .from(subscriptions)
    .where(
      withTenant(params.tenantId, subscriptions.tenantId, eq(subscriptions.userId, params.userId))
    )
    .limit(1);

  if (!subscription) return null;

  const { id: subscriptionId, ...context } = subscription;
  return { subscriptionId, ...context };
}

export async function getMatterAllowanceContextForSubscription(params: {
  tx?: TenantTransaction;
  now?: Date;
  subscription: MatterAllowanceSubscriptionContext;
  tenantId: string;
}): Promise<MatterAllowanceContext> {
  const { subscription } = params;

  const allowanceWindow = buildMatterAllowanceWindow({
    currentPeriodEnd: subscription.currentPeriodEnd,
    currentPeriodStart: subscription.currentPeriodStart,
    now: params.now ?? new Date(),
  });
  const allowanceTotal = resolveMatterAllowance(subscription.planId);
  const consumedCount = await countRecoveryMatterUsageInWindow({
    tx: params.tx,
    end: allowanceWindow.end,
    start: allowanceWindow.start,
    subscriptionId: subscription.subscriptionId,
    tenantId: params.tenantId,
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

export async function getMatterAllowanceContextForUser(params: {
  tenantId: string;
  userId: string;
  now?: Date;
}): Promise<MatterAllowanceContext | null> {
  const subscription = await getMatterAllowanceSubscriptionContextForUser(params);

  if (!subscription) return null;

  return getMatterAllowanceContextForSubscription({
    now: params.now,
    subscription,
    tenantId: params.tenantId,
  });
}

export async function getMatterAllowanceVisibilityForUser(params: {
  tenantId: string;
  userId: string;
  now?: Date;
}): Promise<MatterAllowanceVisibility | null> {
  const context = await getMatterAllowanceContextForUser(params);

  if (!context) return null;

  const { subscriptionId: _id, ...visibility } = context;
  return visibility;
}
