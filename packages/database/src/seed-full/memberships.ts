import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';
import { TENANTS } from './constants';

import type { SeedConfig } from '../seed-types';

export async function seedSubscriptionsAndCommissions(config: SeedConfig) {
  console.log('💳 Seeding Subscriptions and Commissions...');
  const { at } = config;

  // Plans
  const PLANS = {
    MK: 'full_mk_plan_std',
    KS: 'full_ks_plan_std',
  };

  await db
    .insert(schema.membershipPlans)
    .values([
      {
        id: PLANS.MK,
        tenantId: TENANTS.MK,
        name: 'Standard MK',
        tier: 'standard',
        price: '100.00',
        features: ['towing'],
      },
      {
        id: PLANS.KS,
        tenantId: TENANTS.KS,
        name: 'Standard KS',
        tier: 'standard',
        price: '100.00',
        features: ['towing'],
      },
    ])
    .onConflictDoNothing();

  const SUBS_CONFIG = [
    { suffix: '1', status: 'active', type: 'agent' },
    { suffix: '2', status: 'canceled', type: 'agent' },
    { suffix: '3', status: 'past_due', type: 'agent' },
    { suffix: '4', status: 'active', type: 'agent' },
    { suffix: '5', status: 'active', type: 'agent' },
    { suffix: '6', status: 'active', type: 'agent' },
    { suffix: '7', status: 'active', type: 'agent' },
    { suffix: '8', status: 'active', type: 'direct' },
    { suffix: '9', status: 'active', type: 'direct' },
  ];

  for (const tenant of [TENANTS.MK, TENANTS.KS]) {
    const tenantPrefix = tenant === TENANTS.MK ? 'mk' : 'ks';
    const planId = tenant === TENANTS.MK ? PLANS.MK : PLANS.KS;

    for (const cfg of SUBS_CONFIG) {
      // Determine ID (must match users.ts)
      // MK: members 1-2 are golden, 3-9 are full
      // KS: members 1-3 are golden, 4-9 are full
      let memberId = `full_${tenantPrefix}_member_${cfg.suffix}`;
      if (tenant === TENANTS.MK && (cfg.suffix === '1' || cfg.suffix === '2')) {
        memberId = `golden_${tenantPrefix}_member_${cfg.suffix}`;
      } else if (
        tenant === TENANTS.KS &&
        (cfg.suffix === '1' || cfg.suffix === '2' || cfg.suffix === '3')
      ) {
        memberId = `golden_${tenantPrefix}_member_${cfg.suffix}`;
      }

      const subId = `sub_${tenantPrefix}_${cfg.suffix}`;

      // Get agent if valid
      let agentId = null;
      if (cfg.type === 'agent') {
        const user = await db.query.user.findFirst({
          where: eq(schema.user.id, memberId),
          columns: { agentId: true },
        });
        agentId = user?.agentId;
      }

      await db
        .insert(schema.subscriptions)
        .values({
          id: subId,
          userId: memberId,
          tenantId: tenant,
          status: cfg.status as any,
          planId: planId,
          agentId: agentId,
          currentPeriodStart: at(),
          currentPeriodEnd: at(365 * 24 * 60 * 60 * 1000),
        })
        .onConflictDoUpdate({
          target: schema.subscriptions.id,
          set: { status: cfg.status as any },
        });

      // Membership Card
      await db
        .insert(schema.membershipCards)
        .values({
          id: `card_${tenantPrefix}_${cfg.suffix}`,
          tenantId: tenant,
          userId: memberId,
          subscriptionId: subId,
          status: cfg.status === 'active' ? 'active' : 'expired',
          cardNumber: `${tenantPrefix.toUpperCase()}-1000-${cfg.suffix.padStart(4, '0')}`,
          qrCodeToken: `qr_${tenantPrefix}_${cfg.suffix}`,
          issuedAt: at(),
        })
        .onConflictDoNothing();

      // Commissions
      if (cfg.status === 'active' && agentId) {
        const commStatus = parseInt(cfg.suffix) % 2 === 0 ? 'paid' : 'pending';
        await db
          .insert(schema.agentCommissions)
          .values({
            id: `comm_${tenantPrefix}_${cfg.suffix}`,
            tenantId: tenant,
            agentId: agentId,
            memberId: memberId,
            subscriptionId: subId,
            amount: '10.00',
            currency: 'EUR',
            type: 'new_membership',
            status: commStatus,
            metadata: { source: 'seed' },
            earnedAt: at(),
          })
          .onConflictDoNothing();
      }
    }
  }
}
