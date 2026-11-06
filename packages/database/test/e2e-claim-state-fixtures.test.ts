import assert from 'node:assert/strict';
import test from 'node:test';

import { E2E_CASH_STATES_BRANCH } from '../src/e2e-cash-fixtures';
import {
  E2E_CLAIM_STATE_FIXTURES,
  E2E_CLAIM_STATE_INSTANTS,
  E2E_CLAIM_STATES_BRANCH_ID,
} from '../src/e2e-claim-state-fixtures';
import { E2E_USER_IDS } from '../src/e2e-role-fixtures';
import { buildClaimStatesToSeed } from '../src/seed-golden/claim-states';
import { buildClaimsToSeed } from '../src/seed-golden/claims';
import { buildUsersToSeed } from '../src/seed-golden/users';
import * as schema from '../src/schema';
import { createSeedConfig } from '../src/seed-types';

const { at } = createSeedConfig('e2e', new Date('2026-01-01T00:00:00Z'));
const seeded = new Map(buildClaimStatesToSeed().map(claim => [claim.id, claim]));

test('each named claim state carries the lifecycle pair its status maps to', () => {
  const lifecycle = (key: keyof typeof E2E_CLAIM_STATE_FIXTURES) => {
    const claim = seeded.get(E2E_CLAIM_STATE_FIXTURES[key].id);
    return [claim?.caseLifecycleState, claim?.recoveryLifecycleState];
  };
  assert.deepEqual(lifecycle('DRAFT'), ['draft', 'not_started']);
  assert.deepEqual(lifecycle('REJECTED'), ['rejected', 'closed']);
  assert.deepEqual(lifecycle('SUBMITTED_TO_AIRLINE'), ['recovery', 'submitted_to_airline']);
  assert.equal(seeded.size, Object.keys(E2E_CLAIM_STATE_FIXTURES).length, 'ids stay unique');
  for (const claim of seeded.values()) {
    assert.equal('status' in claim, false, `${claim.id} stores only the lifecycle pair`);
  }
});

test('the claim states live in KS-D, owned by the converted member, apart from golden claims', () => {
  assert.equal(E2E_CLAIM_STATES_BRANCH_ID, E2E_CASH_STATES_BRANCH.id);
  const users = new Map(buildUsersToSeed({ at }).map(user => [user.id, user]));
  for (const claim of seeded.values()) {
    assert.match(claim.id, /^golden_ks_d_claim_/, 'reseed cleanup owns the id');
    assert.deepEqual(
      [claim.tenantId, claim.branchId, claim.userId, claim.agentId],
      [
        'tenant_ks',
        E2E_CASH_STATES_BRANCH.id,
        E2E_USER_IDS.KS_MEMBER_CONVERTED_LEAD,
        E2E_USER_IDS.KS_AGENT_CASH_STATES,
      ],
      claim.id
    );
    for (const userId of [claim.userId, claim.agentId, claim.staffId, claim.assignedById]) {
      if (userId) assert.equal(users.get(userId)?.tenantId, 'tenant_ks', `${claim.id} ${userId}`);
    }
  }
  // KS-A/KS-B/KS-C counts, SLA breaches and health labels keep their own claims.
  const golden = buildClaimsToSeed({ at, schema });
  assert.equal(golden.filter(claim => claim.branchId === E2E_CASH_STATES_BRANCH.id).length, 0);
  assert.equal(golden.filter(claim => seeded.has(claim.id)).length, 0);
});

test('only the decided states are assigned, and every instant is a fixed calendar value', () => {
  const created = new Date(E2E_CLAIM_STATE_INSTANTS.CREATED);
  const changed = new Date(E2E_CLAIM_STATE_INSTANTS.STATUS_CHANGED);
  for (const fixture of Object.values(E2E_CLAIM_STATE_FIXTURES)) {
    const claim = seeded.get(fixture.id);
    assert.ok(claim, fixture.id);
    const staffId = fixture.staff ? E2E_USER_IDS[fixture.staff] : null;
    const decided = fixture.status !== 'draft';
    assert.deepEqual(
      [claim.staffId, claim.assignedById, claim.assignedAt, claim.statusUpdatedAt],
      [
        staffId,
        staffId ? E2E_USER_IDS.KS_ADMIN : null,
        staffId ? created : null,
        decided ? changed : null,
      ],
      fixture.id
    );
    assert.deepEqual(claim.createdAt, created, fixture.id);
    assert.equal(decided, staffId === E2E_USER_IDS.KS_STAFF_UNASSIGNED, fixture.id);
  }
  assert.deepEqual(
    buildClaimStatesToSeed(),
    buildClaimStatesToSeed(),
    'the rows are deterministic'
  );
});
