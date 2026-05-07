import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import { buildSeededMembershipCardIdentifiers } from './membership-cards';
import type { SeedGoldenContext } from './types';

const PLAN_MK = 'golden_mk_plan_basic';
const PLAN_KS = 'golden_ks_plan_basic';
const PLAN_PILOT = 'golden_pilot_plan_basic';
const PLAN_STANDARD_TIER = 'standard';

export function buildSubscriptionsToSeed() {
  return [
    {
      id: goldenId('sub_mk_1'),
      user: 'mk_member_1',
      tenant: TENANTS.MK,
      plan: PLAN_MK,
      agent: 'mk_agent_a1',
      branch: 'mk_branch_a',
    },
    {
      id: goldenId('sub_ks_a_1'),
      user: 'ks_a_member_1',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_agent_a1',
      branch: 'ks_branch_a',
    },
    {
      id: goldenId('sub_ks_a_2'),
      user: 'ks_a_member_2',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_agent_a1',
      branch: 'ks_branch_a',
    },
    {
      id: goldenId('sub_ks_b_1'),
      user: 'ks_b_member_1',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_b_agent_1',
      branch: 'ks_branch_b',
    },
    {
      id: goldenId('sub_pilot_prishtina_1'),
      user: 'pilot_prishtina_member_01',
      tenant: TENANTS.PILOT,
      plan: PLAN_PILOT,
      agent: 'pilot_mk_agent',
      branch: 'pilot_branch_prishtina_central',
    },
  ];
}

export async function seedMemberships({ at, db, schema }: SeedGoldenContext) {
  console.log('💳 Seeding Subscriptions...');
  await db
    .insert(schema.membershipPlans)
    .values([
      {
        id: PLAN_MK,
        tenantId: TENANTS.MK,
        name: 'Golden Basic MK',
        tier: 'standard',
        price: '100.00',
        features: ['towing', 'legal'],
      },
      {
        id: PLAN_KS,
        tenantId: TENANTS.KS,
        name: 'Golden Basic KS',
        tier: 'standard',
        price: '120.00',
        features: ['towing', 'legal', 'roadside'],
      },
      {
        id: PLAN_PILOT,
        tenantId: TENANTS.PILOT,
        name: 'Pilot Baseline Membership',
        tier: 'standard',
        price: '0.00',
        features: ['claims', 'diaspora', 'roadside'],
      },
    ])
    .onConflictDoNothing();

  for (const s of buildSubscriptionsToSeed()) {
    await db
      .insert(schema.subscriptions)
      .values({
        id: s.id,
        userId: goldenId(s.user),
        tenantId: s.tenant,
        status: 'active',
        planId: PLAN_STANDARD_TIER,
        planKey: s.plan,
        agentId: goldenId(s.agent),
        branchId: s.branch,
        currentPeriodStart: at(),
        currentPeriodEnd: at(365 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({
        target: schema.subscriptions.id,
        set: {
          status: 'active',
          planId: PLAN_STANDARD_TIER,
          planKey: s.plan,
          branchId: s.branch,
          currentPeriodStart: at(),
          currentPeriodEnd: at(365 * 24 * 60 * 60 * 1000),
        },
      });

    const membershipCardIdentifiers = buildSeededMembershipCardIdentifiers(s.id, s.tenant);

    await db
      .insert(schema.membershipCards)
      .values({
        id: `card_${s.id}`,
        tenantId: s.tenant,
        subscriptionId: s.id,
        userId: goldenId(s.user),
        cardNumber: membershipCardIdentifiers.cardNumber,
        qrCodeToken: membershipCardIdentifiers.qrCodeToken,
        status: 'active',
      })
      .onConflictDoNothing();
  }
}
