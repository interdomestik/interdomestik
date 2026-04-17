import { db } from '@interdomestik/database';

export function createActiveAnnualMembershipState(now: Date): {
  status: 'active';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
} {
  const currentPeriodStart = now;
  const currentPeriodEnd = new Date(now);
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);

  return {
    status: 'active',
    currentPeriodStart,
    currentPeriodEnd,
  };
}

export async function resolveCanonicalMembershipPlanState(params: {
  tenantId: string;
  planId: string;
}): Promise<{
  planId: string;
  planKey: string | null;
}> {
  const rawPlanId = params.planId.trim();
  if (!rawPlanId) {
    return {
      planId: 'unknown',
      planKey: null,
    };
  }

  const plan = await db.query.membershipPlans.findFirst({
    where: (membershipPlans, { and, eq, or }) =>
      and(
        eq(membershipPlans.tenantId, params.tenantId),
        or(
          eq(membershipPlans.id, rawPlanId),
          eq(membershipPlans.paddlePriceId, rawPlanId),
          eq(membershipPlans.tier, rawPlanId as 'standard' | 'family')
        )
      ),
    columns: {
      id: true,
      tier: true,
    },
  });

  return {
    planId: plan?.tier ?? rawPlanId,
    planKey: plan?.id ?? null,
  };
}

export function createCanonicalMembershipPlanState(
  planId: string,
  planKey?: string | null
): {
  planId: string;
  planKey?: string;
} {
  return {
    planId,
    ...(planKey ? { planKey } : {}),
  };
}

export function createActiveAnnualMembershipFulfillment(
  planId: string,
  now: Date,
  planKey?: string | null
): {
  status: 'active';
  planId: string;
  planKey?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
} {
  return {
    ...createCanonicalMembershipPlanState(planId, planKey),
    ...createActiveAnnualMembershipState(now),
  };
}
