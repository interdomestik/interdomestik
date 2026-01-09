import { db } from '../db';
import * as schema from '../schema';
import { TENANTS } from './constants';

export async function seedBalkanFlows() {
  console.log('🇧🇦 Seeding Balkan Agent Flows...');

  // 1. CASH FLOW: Lead -> Verified -> Converted
  const agentId = 'golden_mk_agent_a1';
  const leadCashId = 'full_lead_mk_cash';

  await db
    .insert(schema.memberLeads)
    .values({
      id: leadCashId,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      agentId: agentId,
      firstName: 'Balkan',
      lastName: 'CashLead',
      email: 'lead.cash.mk@example.com',
      phone: '+38970111222',
      status: 'converted',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(schema.leadPaymentAttempts)
    .values({
      id: 'pay_attempt_mk_cash_1',
      tenantId: TENANTS.MK,
      leadId: leadCashId,
      method: 'cash',
      status: 'succeeded',
      amount: 12000,
      currency: 'EUR',
      verifiedBy: 'golden_mk_bm_a',
      verifiedAt: new Date(),
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  // 2. CARD FLOW: Lead -> Card Success (Simulated) -> Converted
  const leadCardId = 'full_lead_mk_card';
  await db
    .insert(schema.memberLeads)
    .values({
      id: leadCardId,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      agentId: agentId,
      firstName: 'Balkan',
      lastName: 'CardLead',
      email: 'lead.card.mk@example.com',
      phone: '+38970333444',
      status: 'converted',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(schema.leadPaymentAttempts)
    .values({
      id: 'pay_attempt_mk_card_1',
      tenantId: TENANTS.MK,
      leadId: leadCardId,
      method: 'card',
      status: 'succeeded',
      amount: 12000,
      currency: 'EUR',
      paddleTransactionId: 'txn_simulated_full_seed',
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}
