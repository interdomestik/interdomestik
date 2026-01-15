import type { SeedConfig } from '../seed-types';
import { TENANTS, WORKLOAD_PREFIX } from './constants';

export async function seedWorkloadCommissions(
  db: any,
  schema: any,
  subscriptions: any[],
  agents: any[],
  config: SeedConfig
) {
  console.log('💰 Seeding Workload Commissions...');
  const { at } = config;

  const commissions: any[] = [];

  // Seed commissions for the first 15 subscriptions
  for (let i = 0; i < Math.min(subscriptions.length, 15); i++) {
    const sub = subscriptions[i];
    const tenantAgents = agents.filter(a => a.tenantId === sub.tenantId);
    const agent = tenantAgents[i % tenantAgents.length];

    commissions.push({
      id: `${WORKLOAD_PREFIX}comm_${sub.id}`,
      tenantId: sub.tenantId,
      agentId: agent.id,
      memberId: sub.userId,
      subscriptionId: sub.id,
      type: 'new_membership',
      status: i % 3 === 0 ? 'paid' : i % 3 === 1 ? 'approved' : 'pending',
      amount: '30.00',
      currency: sub.tenantId === TENANTS.MK ? 'MKD' : 'EUR', // Simplified
      earnedAt: at(),
      paidAt: i % 3 === 0 ? at() : null,
    });
  }

  if (commissions.length > 0) {
    await db.insert(schema.agentCommissions).values(commissions).onConflictDoNothing();
  }
}
