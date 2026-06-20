import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  disclosure: {
    contractingCompany: 'Interdomestik KS LLC',
    governingLaw: 'XK',
    unavailable: false,
    source: 'subscription' as const,
  },
  getSubscriptionEntityDisclosureCore: vi.fn(),
}));

vi.mock('@/lib/entity-disclosure.core', () => ({
  getSubscriptionEntityDisclosureCore: hoisted.getSubscriptionEntityDisclosureCore,
}));

import {
  attachMembershipEntityDisclosure,
  attachMembershipEntityDisclosures,
} from './_entity-disclosure';

type SubscriptionInput = Parameters<typeof attachMembershipEntityDisclosure>[0];
type PlanInput = NonNullable<SubscriptionInput['plan']>;

describe('membership entity disclosure attachment', () => {
  it('reuses disclosure reads for subscription rows with the same legal entity snapshot', async () => {
    hoisted.getSubscriptionEntityDisclosureCore.mockResolvedValue(hoisted.disclosure);

    const records = [
      subscriptionRecord('sub-1', 'legal-ks', 'XK'),
      subscriptionRecord('sub-2', 'legal-ks', 'XK'),
    ];

    await expect(attachMembershipEntityDisclosures(records)).resolves.toEqual([
      expect.objectContaining({ id: 'sub-1', entityDisclosure: hoisted.disclosure }),
      expect.objectContaining({ id: 'sub-2', entityDisclosure: hoisted.disclosure }),
    ]);
    expect(hoisted.getSubscriptionEntityDisclosureCore).toHaveBeenCalledTimes(1);
  });

  it('strips price-bearing offer fields from the membership workspace plan', async () => {
    hoisted.getSubscriptionEntityDisclosureCore.mockResolvedValue(hoisted.disclosure);

    const record = await attachMembershipEntityDisclosure({
      ...subscriptionRecord('sub-1', 'legal-ks', 'XK'),
      plan: membershipPlan({
        id: 'standard-year',
        name: 'Standard',
        price: '20.00',
        interval: 'year',
        tier: 'standard',
        paddlePriceId: 'pri_standard',
      }),
    });

    expect(record.plan).toEqual({
      kind: 'membership_workspace_plan',
      id: 'standard-year',
      name: 'Standard',
    });
    expect(record.plan).not.toHaveProperty('price');
    expect(record.plan).not.toHaveProperty('interval');
    expect(record.plan).not.toHaveProperty('tier');
    expect(record.plan).not.toHaveProperty('paddlePriceId');
  });
});

function subscriptionRecord(
  id: string,
  legalTenantId: string,
  governingLawSnapshot: string
): SubscriptionInput {
  return {
    id,
    tenantId: 'tenant-ks',
    userId: 'member-1',
    status: 'active',
    planId: 'standard',
    planKey: 'standard-year',
    provider: 'paddle',
    providerSubscriptionId: 'sub_paddle_1',
    providerCustomerId: 'ctm_1',
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    pastDueAt: null,
    gracePeriodEndsAt: null,
    dunningAttemptCount: 0,
    lastDunningAt: null,
    referredByAgentId: null,
    referredByMemberId: null,
    referralCode: null,
    acquisitionSource: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    branchId: null,
    agentId: null,
    legalTenantId,
    billingEntity: null,
    governingLawSnapshot,
    termsVersionAccepted: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: null,
    plan: null,
  };
}

function membershipPlan(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    id: 'standard-year',
    tenantId: 'tenant-ks',
    name: 'Standard',
    description: null,
    tier: 'standard',
    interval: 'year',
    price: '20.00',
    currency: 'EUR',
    membersIncluded: 1,
    legalConsultationsPerYear: 1,
    mediationDiscountPercent: 0,
    successFeePercent: 15,
    paddlePriceId: 'pri_standard',
    paddleProductId: 'pro_standard',
    features: [],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}
