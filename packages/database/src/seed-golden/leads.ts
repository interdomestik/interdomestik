import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

export function buildLeadsToSeed() {
  return [
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: `ks_a_cash_lead_${i + 1}`,
      branch: 'ks_branch_a',
      agent: 'ks_agent_a1',
      tenant: TENANTS.KS,
      phone: '+38344111222',
      amount: 15000,
    })),
    {
      id: 'ks_b_cash_lead_1',
      branch: 'ks_branch_b',
      agent: 'ks_b_agent_1',
      tenant: TENANTS.KS,
      phone: '+38344111222',
      amount: 15000,
    },
  ];
}

export async function seedLeads({ at, db, schema }: SeedGoldenContext) {
  console.log('💰 Seeding Leads & Cash Pending (KS)...');
  const ksLeads = buildLeadsToSeed();

  for (const l of ksLeads) {
    await db
      .insert(schema.memberLeads)
      .values({
        id: goldenId(l.id),
        tenantId: l.tenant,
        branchId: l.branch,
        agentId: goldenId(l.agent),
        firstName: 'Demo',
        lastName: `Lead ${l.id}`,
        email: `${l.id}@example.com`,
        phone: l.phone,
        status: 'payment_pending',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.leadPaymentAttempts)
      .values({
        id: goldenId(`attempt_${l.id}`),
        tenantId: l.tenant,
        leadId: goldenId(l.id),
        method: 'cash',
        status: 'pending',
        amount: l.amount,
        createdAt: at(-(ksLeads.indexOf(l) + 1) * 2 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing();
  }

  await db
    .insert(schema.memberLeads)
    .values({
      id: goldenId('lead_balkan'),
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      agentId: goldenId('agent_balkan_1'),
      firstName: 'Balkan',
      lastName: 'Lead',
      email: 'lead.balkan@example.com',
      phone: '+38970111222',
      status: 'payment_pending',
    })
    .onConflictDoNothing();

  await db
    .insert(schema.leadPaymentAttempts)
    .values({
      id: goldenId('pay_attempt_balkan'),
      tenantId: TENANTS.MK,
      leadId: goldenId('lead_balkan'),
      method: 'cash',
      status: 'pending',
      amount: 12000,
      createdAt: at(),
    })
    .onConflictDoNothing();
}
