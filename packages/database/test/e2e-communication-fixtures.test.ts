import assert from 'node:assert/strict';
import test from 'node:test';
import {
  E2E_DISCOVERY_THREADS,
  E2E_DISCOVERY_NOTIFICATIONS,
} from '../src/e2e-communication-fixtures';
import { E2E_DISCOVERY_AS_OF, E2E_DISCOVERY_SEED_BASE_TIME } from '../src/e2e-document-fixtures';
import { E2E_CASE_FIXTURES, E2E_MESSAGE_FIXTURES, E2E_USER_IDS } from '../src/e2e-role-fixtures';
import {
  buildDiscoveryMessagesToSeed,
  buildDiscoveryNotificationsToSeed,
} from '../src/seed-golden/discovery';
import { buildRoleRelationshipMessages } from '../src/seed-golden/role-relationships';
import { assertStrictDiscoveryGroup } from './discovery-fixture-test-helpers';

test('six named threads reuse the existing anchor pair and admit agent replies only on active links', () => {
  const rows = buildDiscoveryMessagesToSeed();
  assert.equal(rows.length, 22);
  assert.equal(new Set(rows.map(row => row.id)).size, 22);
  assert.deepEqual(rows, buildDiscoveryMessagesToSeed());
  assert.ok(rows.every(row => row.createdAt && row.createdAt <= new Date(E2E_DISCOVERY_AS_OF)));
  const original = buildRoleRelationshipMessages({
    at: offset => new Date(Date.parse(E2E_DISCOVERY_SEED_BASE_TIME) + (offset ?? 0)),
  });
  for (const fixture of Object.values(E2E_MESSAGE_FIXTURES)) {
    assert.deepEqual(
      rows.find(row => row.id === fixture.id),
      original.find(row => row.id === fixture.id)
    );
  }
  for (const [key, thread] of Object.entries(E2E_DISCOVERY_THREADS)) {
    const claim = E2E_CASE_FIXTURES[key as keyof typeof E2E_CASE_FIXTURES];
    for (const { row } of Object.values(thread)) {
      assert.equal(row.claimId, claim.id);
      assert.equal(row.tenantId, claim.tenantId);
    }
    assert.equal(thread.MEMBER_REQUEST.row.senderId, claim.ownerUserId);
    assert.ok(thread.MEMBER_REQUEST.row.readAt);
    assert.equal(thread.STAFF_REPLY.row.readAt, null);
  }
  assert.equal(E2E_DISCOVERY_THREADS.KS_OTHER_BRANCH.AGENT_REPLY, undefined);
  assert.equal(E2E_DISCOVERY_THREADS.MK_FOREIGN_TENANT.AGENT_REPLY, undefined);
  assert.equal(
    E2E_DISCOVERY_THREADS.KS_OTHER_BRANCH.STAFF_REPLY.row.senderId,
    E2E_USER_IDS.KS_ADMIN
  );
});

test('message intentions distinguish branch scope, internal notes and read-only roles', () => {
  const peer = E2E_DISCOVERY_THREADS.KS_PEER_STAFF;
  assert.ok(peer.STAFF_REPLY.access.read.allowed.includes('KS_STAFF'));
  const unassigned = E2E_DISCOVERY_THREADS.KS_UNASSIGNED;
  assert.ok(unassigned.STAFF_REPLY.access.read.allowed.includes('KS_STAFF_UNASSIGNED'));
  assert.ok(unassigned.INTERNAL_NOTE.access.read.denied.includes('KS_MEMBER'));
  assert.ok(unassigned.INTERNAL_NOTE.access.deniedWrite.actors.includes('KS_AGENT'));
  assert.ok(unassigned.STAFF_REPLY.access.read.denied.includes('GLOBAL_SUPPORT'));
  assert.ok(unassigned.STAFF_REPLY.access.read.denied.includes('AUDITOR'));
  assert.ok(unassigned.STAFF_REPLY.access.deniedWrite.actors.includes('KS_BRANCH_MANAGER'));
  assert.ok(
    E2E_DISCOVERY_THREADS.KS_OTHER_BRANCH.STAFF_REPLY.access.read.denied.includes('KS_STAFF')
  );
  assert.ok(
    E2E_DISCOVERY_THREADS.MK_FOREIGN_TENANT.STAFF_REPLY.access.read.allowed.includes('MK_STAFF')
  );
  assert.ok(
    E2E_DISCOVERY_THREADS.MK_FOREIGN_TENANT.STAFF_REPLY.access.read.denied.includes('KS_ADMIN')
  );
});

test('each claim has private read/unread notifications with explicit recipient and canonical link', () => {
  const rows = buildDiscoveryNotificationsToSeed();
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map(row => row.id)).size, 12);
  assert.deepEqual(rows, buildDiscoveryNotificationsToSeed());
  assert.ok(rows.every(row => row.createdAt && row.createdAt <= new Date(E2E_DISCOVERY_AS_OF)));
  for (const pair of Object.values(E2E_DISCOVERY_NOTIFICATIONS)) {
    assert.equal(pair.READ.row.isRead, true);
    assert.equal(pair.UNREAD.row.isRead, false);
    assert.equal(pair.READ.row.userId, pair.UNREAD.row.userId);
    for (const fixture of Object.values(pair)) {
      assert.equal(fixture.access.read.allowed.length, 1);
      assert.equal(E2E_USER_IDS[fixture.access.read.allowed[0]], fixture.row.userId);
      assert.ok(fixture.access.deniedWrite.actors.includes('GLOBAL_SUPPORT'));
      assert.ok(fixture.access.deniedWrite.actors.includes('AUDITOR'));
      assert.match(fixture.row.actionUrl, /^\/(member|staff)\/claims\//);
    }
  }
});

test('strict messages and notifications reject every missing, extra or drifted field', () => {
  assertStrictDiscoveryGroup('claimMessages');
  assertStrictDiscoveryGroup('notifications');
});
