import {
  E2E_CASH_STATE_FIXTURES,
  E2E_CASH_STATE_USERS,
  E2E_CASH_STATES_BRANCH,
  e2eCashInstant,
  type E2ECashStateFixture,
} from '../e2e-cash-fixtures';
import { E2E_USER_IDS } from '../e2e-role-fixtures';
import { excludedSet } from '../seed-utils/excluded-set';
import { TENANTS } from './constants';
import { buildSeededMembershipCardIdentifiers } from './membership-cards';
import type { SeedGoldenContext } from './types';

const BRANCH = E2E_CASH_STATES_BRANCH.id;
const AGENT_ID = E2E_USER_IDS.KS_AGENT_CASH_STATES;
const VERIFIER_ID = E2E_USER_IDS.KS_ADMIN;
const MEMBER_ID = E2E_USER_IDS.KS_MEMBER_CONVERTED_LEAD;
const CONVERTED_SUBSCRIPTION_ID = 'golden_sub_ks_cash_converted';
const CASH_AMOUNT = 15000;
const FIXTURES: readonly E2ECashStateFixture[] = Object.values(E2E_CASH_STATE_FIXTURES);

/** The cash-state agent and the member its converted lead became (agent-assisted, as conversion). */
export function buildCashStateUsersToSeed({ at }: Pick<SeedGoldenContext, 'at'>) {
  const agent = E2E_CASH_STATE_USERS.KS_AGENT_CASH_STATES;
  const member = E2E_CASH_STATE_USERS.KS_MEMBER_CONVERTED_LEAD;
  return [
    {
      id: AGENT_ID,
      name: agent.name,
      email: agent.email,
      role: 'agent' as const,
      tenantId: TENANTS.KS,
      branchId: BRANCH,
    },
    {
      id: MEMBER_ID,
      name: member.name,
      email: member.email,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: BRANCH,
      agentId: AGENT_ID,
      createdBy: 'agent',
      assistedByAgentId: AGENT_ID,
      memberNumber: 'MEM-2026-000023',
      memberNumberIssuedAt: at(),
    },
  ];
}

function lastChange(fixture: E2ECashStateFixture) {
  return e2eCashInstant(fixture.isResubmission ? 'RESUBMITTED' : 'DECIDED');
}

/** The lead and attempt row of every cash state, as the verify and resubmit transitions leave it. */
export function buildCashStatesToSeed() {
  return FIXTURES.map(fixture => ({
    lead: {
      id: fixture.leadId,
      tenantId: TENANTS.KS,
      branchId: BRANCH,
      agentId: AGENT_ID,
      firstName: 'Cash',
      lastName: fixture.leadId,
      email: fixture.email,
      phone: '+38344111333',
      status: fixture.leadStatus,
      convertedUserId: fixture.convertedMember ? E2E_USER_IDS[fixture.convertedMember] : null,
      createdAt: e2eCashInstant('SUBMITTED'),
      updatedAt: lastChange(fixture),
    },
    attempt: {
      id: fixture.attemptId,
      tenantId: TENANTS.KS,
      leadId: fixture.leadId,
      method: 'cash' as const,
      status: fixture.attemptStatus,
      amount: CASH_AMOUNT,
      currency: 'EUR',
      verifiedBy: VERIFIER_ID,
      verifiedAt: e2eCashInstant('DECIDED'),
      verificationNote: fixture.note,
      isResubmission: fixture.isResubmission,
      createdAt: e2eCashInstant('SUBMITTED'),
      updatedAt: lastChange(fixture),
    },
  }));
}

/** The active membership and card the converted lead's member received. */
export function buildConvertedMembershipToSeed() {
  const identifiers = buildSeededMembershipCardIdentifiers(CONVERTED_SUBSCRIPTION_ID, TENANTS.KS);
  return {
    subscription: {
      id: CONVERTED_SUBSCRIPTION_ID,
      tenantId: TENANTS.KS,
      userId: MEMBER_ID,
      agentId: AGENT_ID,
      branchId: BRANCH,
      status: 'active' as const,
      planId: 'standard',
      planKey: 'golden_ks_plan_basic',
      cancelAtPeriodEnd: false,
      currentPeriodStart: e2eCashInstant('DECIDED'),
      currentPeriodEnd: e2eCashInstant('PERIOD_END'),
    },
    card: {
      id: `card_${CONVERTED_SUBSCRIPTION_ID}`,
      tenantId: TENANTS.KS,
      subscriptionId: CONVERTED_SUBSCRIPTION_ID,
      userId: MEMBER_ID,
      cardNumber: identifiers.cardNumber,
      qrCodeToken: identifiers.qrCodeToken,
      status: 'active' as const,
      expiresAt: null,
      revokedAt: null,
    },
  };
}

/** Upserts restore each state on every run, so a drifted row cannot survive a reseed. */
export async function seedCashStates({ db, schema }: SeedGoldenContext) {
  console.log('💶 Seeding cash verification states (KS-D)...');
  const rows = buildCashStatesToSeed();
  const leads = rows.map(row => row.lead);
  const attempts = rows.map(row => row.attempt);
  const { subscription, card } = buildConvertedMembershipToSeed();
  await db
    .insert(schema.memberLeads)
    .values(leads)
    .onConflictDoUpdate({
      target: schema.memberLeads.id,
      set: excludedSet(schema.memberLeads, leads[0]),
    });
  await db
    .insert(schema.leadPaymentAttempts)
    .values(attempts)
    .onConflictDoUpdate({
      target: schema.leadPaymentAttempts.id,
      set: excludedSet(schema.leadPaymentAttempts, attempts[0]),
    });
  await db
    .insert(schema.subscriptions)
    .values(subscription)
    .onConflictDoUpdate({
      target: schema.subscriptions.id,
      set: excludedSet(schema.subscriptions, subscription),
    });
  await db
    .insert(schema.membershipCards)
    .values(card)
    .onConflictDoUpdate({
      target: schema.membershipCards.id,
      set: excludedSet(schema.membershipCards, card),
    });
}
