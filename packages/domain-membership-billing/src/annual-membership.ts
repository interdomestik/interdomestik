import { and, asc, db, eq, membershipPlans } from '@interdomestik/database';

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
  const canonicalTier =
    rawPlanId === 'standard' || rawPlanId === 'family' || rawPlanId === 'business'
      ? rawPlanId
      : null;
  const [planById] = await db
    .select({
      id: membershipPlans.id,
      tier: membershipPlans.tier,
    })
    .from(membershipPlans)
    .where(and(eq(membershipPlans.tenantId, params.tenantId), eq(membershipPlans.id, rawPlanId)))
    .limit(1);

  if (planById) {
    return {
      planId: planById.tier,
      planKey: planById.id,
    };
  }

  const [planByProviderId] = await db
    .select({
      id: membershipPlans.id,
      tier: membershipPlans.tier,
    })
    .from(membershipPlans)
    .where(
      and(
        eq(membershipPlans.tenantId, params.tenantId),
        eq(membershipPlans.paddlePriceId, rawPlanId)
      )
    )
    .limit(1);

  if (planByProviderId) {
    return {
      planId: planByProviderId.tier,
      planKey: planByProviderId.id,
    };
  }

  if (!canonicalTier) {
    return {
      planId: rawPlanId,
      planKey: null,
    };
  }

  const [planByTier] = await db
    .select({
      id: membershipPlans.id,
      tier: membershipPlans.tier,
    })
    .from(membershipPlans)
    .where(
      and(
        eq(membershipPlans.tenantId, params.tenantId),
        eq(membershipPlans.tier, canonicalTier),
        eq(membershipPlans.interval, 'year'),
        eq(membershipPlans.isActive, true)
      )
    )
    .orderBy(asc(membershipPlans.id))
    .limit(1);

  return {
    planId: planByTier?.tier ?? rawPlanId,
    planKey: planByTier?.id ?? null,
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
