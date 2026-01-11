import { TENANTS, WORKLOAD_PREFIX } from './constants';

export async function seedWorkloadMemberships(db: any, schema: any, members: any[], agents: any[]) {
  console.log('💳 Seeding Workload Memberships...');

  const PLAN_MK = `${WORKLOAD_PREFIX}mk_plan`;
  const PLAN_KS = `${WORKLOAD_PREFIX}ks_plan`;

  await db
    .insert(schema.membershipPlans)
    .values([
      {
        id: PLAN_MK,
        tenantId: TENANTS.MK,
        name: 'Workload Standard MK',
        tier: 'standard',
        price: '150.00',
        features: ['towing', 'legal'],
      },
      {
        id: PLAN_KS,
        tenantId: TENANTS.KS,
        name: 'Workload Premium KS',
        tier: 'family',
        price: '200.00',
        features: ['towing', 'legal', 'roadside'],
      },
    ])
    .onConflictDoNothing();

  const subscriptions: any[] = [];
  const cards: any[] = [];
  const agentClients: any[] = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const isActive = i % 10 < 7; // 70% active
    const isPastDue = i % 10 === 7; // 10% past_due
    const isCanceled = i % 10 === 8; // 10% canceled
    // last 10% no subscription

    if (isActive || isPastDue || isCanceled) {
      const status = isActive ? 'active' : isPastDue ? 'past_due' : 'canceled';
      const planId = member.tenantId === TENANTS.MK ? PLAN_MK : PLAN_KS;
      const subId = `${WORKLOAD_PREFIX}sub_${member.id}`;

      subscriptions.push({
        id: subId,
        userId: member.id,
        tenantId: member.tenantId,
        planId,
        status,
        currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (isActive) {
        cards.push({
          id: `${WORKLOAD_PREFIX}card_${member.id}`,
          userId: member.id,
          tenantId: member.tenantId,
          subscriptionId: subId,
          cardNumber: `W-${member.id.slice(-8).toUpperCase()}`,
          qrCodeToken: `QR-${subId}`,
          status: 'active',
          issuedAt: new Date(),
        });
      }

      // Link to agent
      const tenantAgents = agents.filter(a => a.tenantId === member.tenantId);
      const agent = tenantAgents[i % tenantAgents.length];
      agentClients.push({
        id: `${WORKLOAD_PREFIX}link_${member.id}`,
        tenantId: member.tenantId,
        agentId: agent.id,
        memberId: member.id,
        status: 'active',
      });
    }
  }

  if (subscriptions.length > 0) {
    await db.insert(schema.subscriptions).values(subscriptions).onConflictDoNothing();
  }
  if (cards.length > 0) {
    await db.insert(schema.membershipCards).values(cards).onConflictDoNothing();
  }
  if (agentClients.length > 0) {
    await db.insert(schema.agentClients).values(agentClients).onConflictDoNothing();
  }

  return { subscriptions };
}
