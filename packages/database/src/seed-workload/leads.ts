import { TENANTS, WORKLOAD_PREFIX } from './constants';

export async function seedWorkloadLeads(db: any, schema: any, agents: any[]) {
  console.log('💰 Seeding Workload Leads...');

  const leads: any[] = [];
  const payments: any[] = [];
  const now = new Date();

  // KS: 5 cash pending
  const ksAgents = agents.filter(a => a.tenantId === TENANTS.KS);
  for (let i = 0; i < 5; i++) {
    const leadId = `${WORKLOAD_PREFIX}ks_lead_${i + 1}`;
    const agent = ksAgents[i % ksAgents.length];

    leads.push({
      id: leadId,
      tenantId: TENANTS.KS,
      branchId: agent.branchId,
      agentId: agent.id,
      firstName: `Demo-KS`,
      lastName: `Lead-${i + 1}`,
      email: `lead.ks.work${i + 1}@example.com`,
      phone: '+38344555666',
      status: 'payment_pending',
    });

    payments.push({
      id: `${WORKLOAD_PREFIX}pay_ks_${i + 1}`,
      tenantId: TENANTS.KS,
      leadId,
      method: 'cash',
      status: 'pending',
      amount: 12000,
      createdAt: now,
    });
  }

  // MK: 5 cash pending + 3 card succeeded
  const mkAgents = agents.filter(a => a.tenantId === TENANTS.MK);
  for (let i = 0; i < 8; i++) {
    const leadId = `${WORKLOAD_PREFIX}mk_lead_${i + 1}`;
    const agent = mkAgents[i % mkAgents.length];
    const isCard = i >= 5;

    leads.push({
      id: leadId,
      tenantId: TENANTS.MK,
      branchId: agent.branchId,
      agentId: agent.id,
      firstName: `Demo-MK`,
      lastName: `Lead-${i + 1}`,
      email: `lead.mk.work${i + 1}@example.com`,
      phone: '+38970555666',
      status: isCard ? 'converted' : 'payment_pending',
    });

    payments.push({
      id: `${WORKLOAD_PREFIX}pay_mk_${i + 1}`,
      tenantId: TENANTS.MK,
      leadId,
      method: isCard ? 'card' : 'cash',
      status: isCard ? 'succeeded' : 'pending',
      amount: 15000,
      createdAt: now,
    });
  }

  if (leads.length > 0) {
    await db.insert(schema.memberLeads).values(leads).onConflictDoNothing();
  }
  if (payments.length > 0) {
    await db.insert(schema.leadPaymentAttempts).values(payments).onConflictDoNothing();
  }
}
