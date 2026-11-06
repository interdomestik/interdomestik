import assert from 'node:assert/strict';
import test from 'node:test';

import {
  E2E_CASH_INSTANTS,
  E2E_CASH_STATE_FIXTURES,
  E2E_CASH_STATE_USERS,
  E2E_CASH_STATES_BRANCH,
} from '../src/e2e-cash-fixtures';
import { E2E_USER_IDS } from '../src/e2e-role-fixtures';
import { E2E_USERS } from '../src/e2e-users';
import { collectConvertedMemberDrift } from '../src/seed-assert-cash';
import {
  buildCashStatesToSeed,
  buildConvertedMembershipToSeed,
  convertedMemberExpectation,
} from '../src/seed-golden/cash-states';
import { buildLeadsToSeed } from '../src/seed-golden/leads';
import { buildBranchesToSeed } from '../src/seed-golden/tenants-branches';
import { buildUsersToSeed } from '../src/seed-golden/users';

const SEED_BASE = new Date('2026-01-01T00:00:00.000Z');
const at = (offset = 0) => new Date(SEED_BASE.getTime() + offset);
const rows = new Map(buildCashStatesToSeed().map(row => [row.lead.id, row]));
const fixtures = Object.entries(E2E_CASH_STATE_FIXTURES);

test('the cash states live in their own KS branch with their own agent', () => {
  const branches = buildBranchesToSeed();
  const branch = branches.find(row => row.id === E2E_CASH_STATES_BRANCH.id);
  assert.deepEqual(branch, { ...E2E_CASH_STATES_BRANCH, tenantId: 'tenant_ks' });
  assert.equal(new Set(branches.map(row => row.code)).size, branches.length, 'codes stay unique');

  const goldenBranches = ['ks_branch_a', 'ks_branch_b', 'ks_branch_c'];
  for (const { lead } of rows.values()) {
    assert.equal(lead.branchId, E2E_CASH_STATES_BRANCH.id, lead.id);
    assert.equal(lead.agentId, E2E_USER_IDS.KS_AGENT_CASH_STATES, lead.id);
  }
  // The golden branches keep exactly their open cash rows: KS-A three, KS-B one.
  const golden = buildLeadsToSeed().filter(lead => goldenBranches.includes(lead.branch));
  assert.deepEqual(
    goldenBranches.map(id => golden.filter(lead => lead.branch === id).length),
    [3, 1, 0]
  );
});

test('each cash identity is a seeded KS-D login with the attribution conversion leaves', () => {
  const seeded = new Map(buildUsersToSeed({ at }).map(user => [user.id, user]));
  for (const key of Object.keys(E2E_CASH_STATE_USERS) as (keyof typeof E2E_CASH_STATE_USERS)[]) {
    const user = seeded.get(E2E_USER_IDS[key]);
    assert.ok(user, key);
    assert.deepEqual(
      [user.email, user.role, user.tenantId, 'branchId' in user ? user.branchId : null],
      [E2E_USERS[key].email, E2E_USERS[key].dbRole, 'tenant_ks', E2E_CASH_STATES_BRANCH.id],
      key
    );
  }
  const member = seeded.get(E2E_USER_IDS.KS_MEMBER_CONVERTED_LEAD);
  assert.ok(member && 'createdBy' in member);
  assert.deepEqual(
    [member.agentId, member.createdBy, member.assistedByAgentId],
    [E2E_USER_IDS.KS_AGENT_CASH_STATES, 'agent', E2E_USER_IDS.KS_AGENT_CASH_STATES]
  );
  const numbers = [...seeded.values()].flatMap(user =>
    'memberNumber' in user ? [user.memberNumber] : []
  );
  assert.equal(new Set(numbers).size, numbers.length, 'member numbers stay unique');
});

test('lead and attempt rows are the states the verify, resubmit and convert steps leave', () => {
  assert.equal(rows.size, fixtures.length);
  for (const [key, fixture] of fixtures) {
    const row = rows.get(fixture.leadId);
    assert.ok(row, key);
    const { lead, attempt } = row;
    assert.deepEqual(
      [attempt.leadId, attempt.status, attempt.method, attempt.isResubmission],
      [lead.id, fixture.attemptStatus, 'cash', fixture.isResubmission],
      key
    );
    // Every state was decided once by an operator other than the lead's agent.
    assert.ok(attempt.verifiedBy && attempt.verifiedBy !== lead.agentId, key);
    assert.ok(attempt.verifiedAt, key);
    // Requesting info or rejecting needs a note; a resubmission keeps the note it answers.
    const noted = ['needs_info', 'rejected'].includes(attempt.status) || attempt.isResubmission;
    assert.equal(attempt.verificationNote !== null, noted, key);
    // Only a resubmission reopens an attempt; a decision resets the flag.
    assert.equal(attempt.status === 'pending', attempt.isResubmission, key);
    const approved = attempt.status === 'succeeded';
    assert.equal(['paid', 'converted'].includes(lead.status), approved, key);
    assert.equal(lead.convertedUserId !== null, lead.status === 'converted', key);
  }
});

test('the converted lead names its member, membership and card', () => {
  const converted = rows.get(E2E_CASH_STATE_FIXTURES.CONVERTED.leadId);
  assert.ok(converted);
  const memberId = E2E_USER_IDS.KS_MEMBER_CONVERTED_LEAD;
  assert.equal(converted.lead.convertedUserId, memberId);
  assert.equal(converted.lead.email, E2E_USERS.KS_MEMBER_CONVERTED_LEAD.email);

  const { subscription, card } = buildConvertedMembershipToSeed();
  assert.deepEqual(
    [subscription.userId, subscription.agentId, subscription.branchId, subscription.status],
    [memberId, converted.lead.agentId, converted.lead.branchId, 'active']
  );
  assert.deepEqual(
    [card.userId, card.subscriptionId, card.status],
    [memberId, subscription.id, 'active']
  );
  // Conversion starts one annual term at the approval: the end is the same instant a year later.
  const annualEnd = new Date(E2E_CASH_INSTANTS.DECIDED);
  annualEnd.setUTCFullYear(annualEnd.getUTCFullYear() + 1);
  assert.deepEqual(
    [subscription.currentPeriodStart.toISOString(), subscription.currentPeriodEnd.toISOString()],
    [E2E_CASH_INSTANTS.DECIDED, annualEnd.toISOString()]
  );
});

test('the seed assertion refuses drifted attribution and any active agent client grant', () => {
  const member = convertedMemberExpectation();
  assert.deepEqual(collectConvertedMemberDrift({ ...member, extra: 'ignored' }, []), []);
  assert.deepEqual(collectConvertedMemberDrift(undefined, []), [`user ${member.id}: missing`]);
  for (const field of ['agentId', 'createdBy', 'assistedByAgentId', 'branchId'] as const) {
    const drifted = collectConvertedMemberDrift({ ...member, [field]: 'other' }, []);
    assert.equal(drifted.length, 1, field);
    assert.match(drifted[0], new RegExp(`\\.${field}: `), field);
  }
  assert.deepEqual(collectConvertedMemberDrift(member, [{ id: 'grant_1' }]), [
    `user ${member.id}: active agent client grant grant_1`,
  ]);
});

test('cash instants never depend on the seed clock or the wall clock', () => {
  assert.deepEqual(buildCashStatesToSeed(), buildCashStatesToSeed());
  assert.deepEqual(buildConvertedMembershipToSeed(), buildConvertedMembershipToSeed());
  const allowed = new Set<string>(Object.values(E2E_CASH_INSTANTS));
  const { subscription, card } = buildConvertedMembershipToSeed();
  const values = [...rows.values()].flatMap(({ lead, attempt }) => [
    ...Object.values(lead),
    ...Object.values(attempt),
  ]);
  for (const value of [...values, ...Object.values(subscription), ...Object.values(card)]) {
    if (value instanceof Date) assert.ok(allowed.has(value.toISOString()), value.toISOString());
  }
  for (const instant of [E2E_CASH_INSTANTS.SUBMITTED, E2E_CASH_INSTANTS.DECIDED]) {
    assert.ok(new Date(instant) < SEED_BASE, instant);
  }
  assert.ok(new Date(E2E_CASH_INSTANTS.RESUBMITTED) < SEED_BASE);
});
