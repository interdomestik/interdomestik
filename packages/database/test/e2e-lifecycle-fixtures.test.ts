import assert from 'node:assert/strict';
import test from 'node:test';

import {
  E2E_LIFECYCLE_INSTANTS,
  E2E_MEMBERSHIP_LIFECYCLE_FIXTURES,
} from '../src/e2e-lifecycle-fixtures';
import { E2E_USER_IDS } from '../src/e2e-role-fixtures';
import { E2E_USERS } from '../src/e2e-users';
import { buildLifecycleSubscriptionsToSeed } from '../src/seed-golden/lifecycle-memberships';
import { buildUsersToSeed } from '../src/seed-golden/users';

const SEED_BASE = new Date('2026-01-01T00:00:00.000Z');
const at = (offset = 0) => new Date(SEED_BASE.getTime() + offset);
const fixtures = Object.values(E2E_MEMBERSHIP_LIFECYCLE_FIXTURES);

test('each lifecycle state has its own seeded KS member identity', () => {
  const seeded = new Map(buildUsersToSeed({ at }).map(user => [user.id, user]));
  const members = new Set(fixtures.map(fixture => fixture.member));
  assert.equal(members.size, fixtures.length, 'one member per state');

  for (const fixture of fixtures) {
    const identity = E2E_USERS[fixture.member];
    const user = seeded.get(E2E_USER_IDS[fixture.member]);
    assert.deepEqual(
      [identity.dbRole, identity.tenantId, identity.branchId],
      ['member', 'tenant_ks', 'ks_branch_a'],
      fixture.member
    );
    assert.ok(user, `${fixture.member} is produced by the golden user seed`);
    assert.deepEqual(
      [user.email, user.role, user.memberNumber, 'agentId' in user],
      [identity.email, 'member', fixture.memberNumber, false],
      fixture.member
    );
  }

  const numbers = [...seeded.values()].flatMap(user =>
    'memberNumber' in user ? [user.memberNumber] : []
  );
  assert.equal(new Set(numbers).size, numbers.length, 'member numbers stay unique');
});

test('lifecycle instants never depend on the seed clock or the wall clock', () => {
  assert.ok(new Date(E2E_LIFECYCLE_INSTANTS.PAST) < SEED_BASE);
  assert.ok(new Date(E2E_LIFECYCLE_INSTANTS.FAR_FUTURE).getUTCFullYear() >= 2099);
  assert.deepEqual(buildLifecycleSubscriptionsToSeed(), buildLifecycleSubscriptionsToSeed());

  const allowed = new Set(Object.values(E2E_LIFECYCLE_INSTANTS));
  for (const { subscription, card } of buildLifecycleSubscriptionsToSeed()) {
    for (const value of [...Object.values(subscription), ...Object.values(card)]) {
      if (value instanceof Date) assert.ok(allowed.has(value.toISOString()), subscription.id);
    }
  }
});

test('subscription and card rows follow each named state exactly', () => {
  const rows = new Map(buildLifecycleSubscriptionsToSeed().map(row => [row.subscription.id, row]));
  const withSubscription = fixtures.filter(fixture => fixture.subscription !== null);
  assert.equal(rows.size, withSubscription.length);
  assert.deepEqual(
    fixtures.filter(fixture => fixture.subscription === null).map(fixture => fixture.member),
    ['KS_MEMBER_NO_SUBSCRIPTION']
  );

  for (const { member, subscription } of withSubscription) {
    const row = rows.get(subscription.id);
    assert.ok(row, subscription.id);
    assert.deepEqual(
      [row.subscription.userId, row.subscription.status, row.subscription.agentId],
      [E2E_USER_IDS[member], subscription.status, null]
    );
    assert.equal(row.subscription.pastDueAt !== null, subscription.status === 'past_due');
    assert.equal(row.subscription.canceledAt !== null, subscription.status === 'canceled');
    assert.deepEqual(
      [row.card.subscriptionId, row.card.userId, row.card.status],
      [subscription.id, E2E_USER_IDS[member], subscription.card]
    );
    assert.equal(row.card.expiresAt !== null, subscription.card === 'expired');
    assert.equal(row.card.revokedAt !== null, subscription.card === 'revoked');
  }
});
