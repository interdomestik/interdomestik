import {
  and,
  db,
  eq,
  membershipPlans,
  or,
  serviceUsage,
  sql,
  subscriptions,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

export const FAMILY_MATTER_ALLOWANCE = 5;
export const STANDARD_MATTER_ALLOWANCE = 2;
export const RECOVERY_MATTER_SERVICE_CODE_PREFIX = 'staff_recovery_matter:';

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

function normalizeDate(value: NormalizableDate) {
  if (!value) return null;

  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
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

async function resolveMatterAllowance(params: {
  tenantId: string;
  planId: string | null | undefined;
  planKey: string | null | undefined;
}) {
  const planKeyCondition = params.planKey ? eq(membershipPlans.id, params.planKey) : undefined;
  const planIdCondition = params.planId
    ? or(eq(membershipPlans.id, params.planId), eq(membershipPlans.paddlePriceId, params.planId))
    : undefined;
  const lookupCondition =
    planKeyCondition && planIdCondition
      ? or(planKeyCondition, planIdCondition)
      : (planKeyCondition ?? planIdCondition);

  if (!lookupCondition) {
    return STANDARD_MATTER_ALLOWANCE;
  }

  const [plan] = await db
    .select({ tier: membershipPlans.tier })
    .from(membershipPlans)
    .where(withTenant(params.tenantId, membershipPlans.tenantId, lookupCondition))
    .limit(1);

  if (plan?.tier === 'family' || plan?.tier === 'business') {
    return FAMILY_MATTER_ALLOWANCE;
  }

  return STANDARD_MATTER_ALLOWANCE;
}

export function getRecoveryMatterServiceCode(claimId: string) {
  return `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}${claimId}`;
}

export async function hasRecoveryMatterUsageForClaim(params: {
  claimId: string;
  subscriptionId: string;
  tenantId: string;
}) {
  const [existingUsage] = await db
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

  return Boolean(existingUsage);
}

export async function countRecoveryMatterUsageInWindow(params: {
  end: Date;
  start: Date;
  subscriptionId: string;
  tenantId: string;
}) {
  const [usageCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(serviceUsage)
    .where(
      withTenant(
        params.tenantId,
        serviceUsage.tenantId,
        and(
          eq(serviceUsage.subscriptionId, params.subscriptionId),
          sql`${serviceUsage.serviceCode} like ${`${RECOVERY_MATTER_SERVICE_CODE_PREFIX}%`}`,
          sql`${serviceUsage.usedAt} >= ${params.start.toISOString()}`,
          sql`${serviceUsage.usedAt} <= ${params.end.toISOString()}`
        )
      )
    )
    .limit(1);

  return Number(usageCount?.count ?? 0);
}

export async function getMatterAllowanceContextForUser(params: {
  tenantId: string;
  userId: string;
  now?: Date;
}): Promise<MatterAllowanceContext | null> {
  const [subscription] = await db
    .select({
      id: subscriptions.id,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      currentPeriodStart: subscriptions.currentPeriodStart,
      planId: subscriptions.planId,
      planKey: subscriptions.planKey,
    })
    .from(subscriptions)
    .where(
      withTenant(params.tenantId, subscriptions.tenantId, eq(subscriptions.userId, params.userId))
    )
    .limit(1);

  if (!subscription) {
    return null;
  }

  const allowanceWindow = buildMatterAllowanceWindow({
    currentPeriodEnd: subscription.currentPeriodEnd,
    currentPeriodStart: subscription.currentPeriodStart,
    now: params.now ?? new Date(),
  });
  const allowanceTotal = await resolveMatterAllowance({
    tenantId: params.tenantId,
    planId: subscription.planId,
    planKey: subscription.planKey,
  });
  const consumedCount = await countRecoveryMatterUsageInWindow({
    end: allowanceWindow.end,
    start: allowanceWindow.start,
    subscriptionId: subscription.id,
    tenantId: params.tenantId,
  });

  return {
    subscriptionId: subscription.id,
    allowanceTotal,
    consumedCount,
    remainingCount: Math.max(allowanceTotal - consumedCount, 0),
    windowStart: allowanceWindow.start,
    windowEnd: allowanceWindow.end,
  };
}

export async function getMatterAllowanceVisibilityForUser(params: {
  tenantId: string;
  userId: string;
  now?: Date;
}): Promise<MatterAllowanceVisibility | null> {
  const context = await getMatterAllowanceContextForUser(params);

  if (!context) {
    return null;
  }

  const { subscriptionId: _subscriptionId, ...visibility } = context;
  return visibility;
}
