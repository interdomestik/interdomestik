import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  E2E_DISCOVERY_AS_OF,
  E2E_DISCOVERY_SEED_BASE_TIME,
  E2E_DISCOVERY_DOCUMENT_FIXTURES,
  E2E_DISCOVERY_DOCUMENT_ACCESS,
  E2E_SHARE_DOCUMENT_FIXTURES,
  E2E_SHARE_DOCUMENT_ACCESS,
} from '../src/e2e-document-fixtures';
import { E2E_DISCOVERY_ACTORS } from '../src/e2e-discovery-access';
import { E2E_DOCUMENT_FIXTURES, E2E_RUNTIME_ROLES } from '../src/e2e-role-fixtures';
import { E2E_USERS } from '../src/e2e-users';
import {
  buildDiscoveryClaimDocumentsToSeed,
  buildDiscoveryShareDocumentsToSeed,
} from '../src/seed-golden/discovery';
import { buildRoleRelationshipDocuments } from '../src/seed-golden/role-relationships';
import { buildUsersToSeed } from '../src/seed-golden/users';
import {
  assertStrictDiscoveryGroup,
  assertFixtureStoragePath,
  assertDiscoveryReadScope,
} from './discovery-fixture-test-helpers';

test('reuse six boundary documents and add three missing claim-state evidence rows', () => {
  const rows = buildDiscoveryClaimDocumentsToSeed();
  assert.equal(rows.length, 9);
  const old = buildRoleRelationshipDocuments({
    at: offset => new Date(Date.parse(E2E_DISCOVERY_SEED_BASE_TIME) + (offset ?? 0)),
  });
  for (const [key, fixture] of Object.entries(E2E_DOCUMENT_FIXTURES)) {
    assert.deepEqual(
      E2E_DISCOVERY_DOCUMENT_FIXTURES[key as keyof typeof E2E_DOCUMENT_FIXTURES],
      fixture
    );
    assert.deepEqual(
      rows.find(row => row.id === fixture.id),
      old.find(row => row.id === fixture.id)
    );
  }
  const all = [...rows, ...buildDiscoveryShareDocumentsToSeed()];
  assert.equal(new Set(all.map(row => row.id)).size, 13);
  assert.deepEqual(rows, buildDiscoveryClaimDocumentsToSeed());
  for (const row of rows) {
    assertFixtureStoragePath(row.filePath, row.tenantId, row.bucket);
    assert.equal(row.accessTenantId, row.tenantId);
    assert.ok(row.fileSize <= 100 * 1024);
    assert.ok(row.createdAt && row.createdAt <= new Date(E2E_DISCOVERY_AS_OF));
  }
  for (const row of buildDiscoveryShareDocumentsToSeed()) {
    assertFixtureStoragePath(row.storagePath, row.tenantId);
    assert.ok(row.fileSize <= 100 * 1024);
  }
  const deleted = E2E_SHARE_DOCUMENT_FIXTURES.DELETED;
  assert.ok(deleted.deletedAt && deleted.deletedBy === deleted.uploadedBy);
  assert.deepEqual(E2E_SHARE_DOCUMENT_ACCESS.DELETED.read.allowed, []);
});

test('read intentions cover nine roles, tenant/assignment/link denials and the draft boundary', () => {
  assert.deepEqual(
    new Set(E2E_DISCOVERY_ACTORS.map(actor => E2E_USERS[actor].dbRole)),
    new Set(E2E_RUNTIME_ROLES)
  );
  for (const access of Object.values(E2E_DISCOVERY_DOCUMENT_ACCESS)) {
    assert.equal(
      new Set([...access.read.allowed, ...access.read.denied]).size,
      E2E_DISCOVERY_ACTORS.length
    );
    assert.ok(access.read.allowed.every(actor => !access.read.denied.includes(actor)));
    assert.ok(access.deniedWrite.actors.includes('GLOBAL_SUPPORT'));
    assert.ok(access.deniedWrite.actors.includes('AUDITOR'));
    assert.equal(new Set(access.deniedWrite.actors).size, access.deniedWrite.actors.length);
  }
  assert.ok(E2E_DISCOVERY_DOCUMENT_ACCESS.KS_ANCHOR.read.allowed.includes('GLOBAL_SUPPORT'));
  assert.ok(E2E_DISCOVERY_DOCUMENT_ACCESS.KS_ANCHOR.read.denied.includes('KS_STAFF_UNASSIGNED'));
  assert.ok(
    E2E_DISCOVERY_DOCUMENT_ACCESS.KS_OTHER_BRANCH.read.denied.includes('KS_AGENT_INACTIVE_LINK')
  );
  assert.ok(E2E_DISCOVERY_DOCUMENT_ACCESS.DRAFT.read.denied.includes('KS_STAFF_UNASSIGNED'));
  assert.ok(E2E_DISCOVERY_DOCUMENT_ACCESS.REJECTED.read.allowed.includes('KS_STAFF_UNASSIGNED'));
  assert.ok(
    E2E_DISCOVERY_DOCUMENT_ACCESS.SUBMITTED_TO_AIRLINE.read.denied.includes('KS_AGENT_CASH_STATES')
  );
  assert.ok(E2E_DISCOVERY_DOCUMENT_ACCESS.MK_FOREIGN_TENANT.read.denied.includes('KS_ADMIN'));
});

test('no identities are added and the complete golden plus pack population remains under 100', t => {
  const users = buildUsersToSeed({ at: () => new Date(E2E_DISCOVERY_AS_OF) });
  const pack = readFileSync(
    new URL('../src/seed-packs/ks-workflow-pack.ts', import.meta.url),
    'utf8'
  );
  const names = /const ALBANIAN_NAMES = \[([\s\S]*?)\];/.exec(pack)?.[1];
  assert.ok(names);
  const identities = users.length + [...names.matchAll(/'[^']+'/g)].length + 4;
  t.diagnostic(
    `Identities: ${users.length} golden + ${identities - users.length} pack = ${identities}; added 0`
  );
  assert.ok(identities <= 100, `identity count ${identities}`);
  assert.equal(identities, 85, 'PR 3 preserves the merged parent identity population');
  assert.equal(new Set(users.map(row => row.id)).size, users.length);
});

test('strict evidence and polymorphic document snapshots reject missing, extra and drifted metadata', () => {
  assertStrictDiscoveryGroup('claimDocuments');
  assertStrictDiscoveryGroup('documents');
});

test('fixture paths refuse wrong tenant, family, bucket, empty segments and traversal', () => {
  const valid = E2E_SHARE_DOCUMENT_FIXTURES.REPORT.storagePath;
  for (const path of [
    valid.replace('tenant_ks', 'tenant_mk'),
    valid.replace('/claims/', '/policies/'),
    `${valid}/..`,
    valid.replace('/claims/', '/claims//'),
    `${valid}/.`,
    `${valid}\\escape`,
    'pii/tenants/tenant_ks/claims',
  ]) {
    assert.throws(() => assertFixtureStoragePath(path, 'tenant_ks'));
  }
  assert.throws(() => assertFixtureStoragePath(valid, 'tenant_ks', 'policies'));
});

test('live assertion reads complete parent sets and detects extra golden documents', async () => {
  await assertDiscoveryReadScope();
});
