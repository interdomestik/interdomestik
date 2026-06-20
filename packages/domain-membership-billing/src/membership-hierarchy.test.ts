import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createMembershipOffer,
  toMembershipWorkspacePlan,
  type MembershipOffer,
  type MembershipProof,
  type MembershipWorkspacePlan,
} from './membership-hierarchy';

describe('membership hierarchy', () => {
  it('keeps price-bearing data on membership offers', () => {
    const offer = createMembershipOffer({
      id: 'standard-year',
      name: 'Standard',
      currency: 'EUR',
      interval: 'year',
      price: '20.00',
      tier: 'standard',
      paddlePriceId: 'pri_standard',
    });

    expect(offer).toEqual({
      kind: 'membership_offer',
      id: 'standard-year',
      name: 'Standard',
      currency: 'EUR',
      interval: 'year',
      price: '20.00',
      tier: 'standard',
      paddlePriceId: 'pri_standard',
    });
    expectTypeOf(offer).toMatchTypeOf<MembershipOffer>();
  });

  it('projects workspace plan identity without price-bearing offer fields', () => {
    const dbPlan = {
      id: 'standard-year',
      name: 'Standard',
      currency: 'EUR',
      interval: 'year',
      price: '20.00',
      tier: 'standard',
      paddlePriceId: 'pri_standard',
    };

    const workspacePlan = toMembershipWorkspacePlan(dbPlan);

    expect(workspacePlan).toEqual({
      kind: 'membership_workspace_plan',
      id: 'standard-year',
      name: 'Standard',
    });
    expect(workspacePlan).not.toHaveProperty('price');
    expect(workspacePlan).not.toHaveProperty('interval');
    expect(workspacePlan).not.toHaveProperty('tier');
  });
});

const proofWithPrice = {
  kind: 'membership_proof',
  status: 'active',
  planId: 'standard',
  currentPeriodEnd: null,
  gracePeriodEndsAt: null,
  price: '20.00',
} as const;

// @ts-expect-error T-402: membership_proof cannot carry offer price data.
export const proofMustRejectPrice: MembershipProof = proofWithPrice;

const workspacePlanWithTier = {
  kind: 'membership_workspace_plan',
  id: 'standard-year',
  name: 'Standard',
  tier: 'standard',
} as const;

// @ts-expect-error T-402: membership_workspace_plan cannot carry offer tier data.
export const workspacePlanMustRejectTier: MembershipWorkspacePlan = workspacePlanWithTier;
