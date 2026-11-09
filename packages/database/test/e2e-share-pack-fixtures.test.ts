import assert from 'node:assert/strict';
import test from 'node:test';
import {
  E2E_DISCOVERY_AS_OF,
  E2E_SHARE_DOCUMENT_FIXTURES,
  E2E_SHARE_DOCUMENT_SETS,
} from '../src/e2e-document-fixtures';
import {
  E2E_SHARE_PACK_FIXTURES,
  E2E_SHARE_PACK_ACCESS,
  E2E_SHARE_CREATION_INTENTS,
} from '../src/e2e-share-pack-fixtures';
import { E2E_USER_IDS } from '../src/e2e-role-fixtures';
import {
  buildDiscoveryShareDocumentsToSeed,
  buildDiscoverySharePacksToSeed,
  buildDiscoveryRowsToWrite,
  buildDiscoverySnapshot,
} from '../src/seed-golden/discovery';
import {
  buildRoleRelationshipDocuments,
  buildRoleRelationshipMessages,
} from '../src/seed-golden/role-relationships';
import { collectDiscoverySnapshotViolations } from '../src/seed-assert-discovery';
import { assertStrictDiscoveryGroup } from './discovery-fixture-test-helpers';
import { seedClaims } from '../src/seed-golden/claims';
import * as schema from '../src/schema';
import { getTableColumns, sql, type Table, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

test('valid, expired and revoked packs use the named active document set and its owner', () => {
  assert.deepEqual(Object.keys(E2E_SHARE_PACK_FIXTURES), ['VALID', 'EXPIRED', 'REVOKED']);
  const rows = buildDiscoverySharePacksToSeed();
  const documents = buildDiscoveryShareDocumentsToSeed();
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  for (const row of rows) {
    assert.deepEqual(row.documentIds, [...E2E_SHARE_DOCUMENT_SETS.ANCHOR_EVIDENCE.documentIds]);
    assert.equal(row.createdByUserId, E2E_USER_IDS.KS_MEMBER);
    for (const id of row.documentIds) {
      const doc = documents.find(candidate => candidate.id === id);
      assert.ok(doc && doc.deletedAt === null);
      assert.equal(doc.tenantId, row.tenantId);
      assert.equal(doc.uploadedBy, row.createdByUserId);
      assert.equal(doc.entityId, row.entityId);
    }
  }
  const asOf = new Date(E2E_DISCOVERY_AS_OF);
  const live = rows.filter(row => !row.revokedAt && row.expiresAt > asOf);
  assert.deepEqual(
    live.map(row => row.id),
    [E2E_SHARE_PACK_FIXTURES.VALID.id]
  );
  assert.ok(rows[1].expiresAt < asOf);
  assert.ok(rows[2].revokedAt && rows[2].revokedAt < asOf && rows[2].expiresAt > asOf);
  assert.deepEqual(rows, buildDiscoverySharePacksToSeed());
  assert.deepEqual(E2E_SHARE_PACK_ACCESS.EXPIRED.read.allowed, []);
  assert.deepEqual(E2E_SHARE_PACK_ACCESS.REVOKED.read.allowed, []);
  assert.ok(E2E_SHARE_PACK_ACCESS.VALID.requiresValidToken);
});

test('creation intentions reject read-only roles, deleted documents and partial ownership', () => {
  const eligible = E2E_SHARE_CREATION_INTENTS.ANCHOR_EVIDENCE;
  assert.ok(eligible.allowed.includes('KS_MEMBER'));
  assert.ok(eligible.denied.includes('GLOBAL_SUPPORT'));
  assert.ok(eligible.denied.includes('AUDITOR'));
  assert.deepEqual(E2E_SHARE_CREATION_INTENTS.ANCHOR_WITH_DELETED.allowed, []);
  assert.ok(E2E_SHARE_CREATION_INTENTS.MIXED_OWNER.denied.includes('KS_MEMBER'));
  assert.equal(E2E_SHARE_DOCUMENT_FIXTURES.OTHER_MEMBER.uploadedBy, E2E_USER_IDS.KS_MEMBER_A2);
  assert.ok(
    E2E_SHARE_DOCUMENT_SETS.MIXED_OWNER.documentIds.includes(E2E_SHARE_DOCUMENT_FIXTURES.REPORT.id)
  );
});

test('strict packs reject every drift, plus array removal, extras, reordering and duplication', () => {
  assertStrictDiscoveryGroup('sharePacks');
  const original = buildDiscoverySharePacksToSeed()[0].documentIds;
  for (const ids of [
    original.slice(1),
    [...original, 'extra'],
    original.map((_, index) => original[original.length - 1 - index]),
    [original[0], original[0]],
  ]) {
    const snapshot = buildDiscoverySnapshot();
    snapshot.sharePacks[0].documentIds = ids;
    assert.ok(
      collectDiscoverySnapshotViolations(snapshot).some(message => message.includes('drifted'))
    );
  }
});

test('normal claims seeding upserts discovery twice, restoring every field after existing evidence', async t => {
  const snapshot = buildDiscoveryRowsToWrite();
  type Key = keyof typeof snapshot;
  type Write = {
    key: Key;
    rows: Record<string, unknown>[];
    set: Record<string, SQL>;
    target: unknown;
  };
  const keys = Object.keys(snapshot) as Key[];
  const writes: Write[] = [];
  const db = {
    insert: (table: Table) => ({
      values: (rows: Record<string, unknown> | Record<string, unknown>[]) => ({
        onConflictDoUpdate: ({ set, target }: { set: Record<string, SQL>; target: unknown }) => {
          const key = keys.find(candidate => schema[candidate] === table);
          if (key) writes.push({ key, rows: Array.isArray(rows) ? rows : [rows], set, target });
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Parameters<typeof seedClaims>[0]['db'];
  t.mock.method(console, 'log', () => {});
  const context = {
    db,
    schema,
    sql,
    at: (offset = 0) => new Date(Date.parse('2026-01-01T00:00:00.000Z') + offset),
  };
  await seedClaims(context);
  await seedClaims(context);
  const dialect = new PgDialect();
  for (const key of keys) {
    const matching = writes.filter(
      write => write.key === key && write.rows.length === snapshot[key].length
    );
    assert.equal(matching.length, 2, `${key} discovery step runs on both normal seed calls`);
    for (const write of matching) {
      assert.deepEqual(write.rows, snapshot[key]);
      assert.equal(write.target, schema[key].id);
      const expectedFields = Object.keys(snapshot[key][0]).filter(field => field !== 'id');
      assert.deepEqual(new Set(Object.keys(write.set)), new Set(expectedFields));
      const columns = getTableColumns(schema[key] as Table);
      for (const field of expectedFields) {
        assert.equal(dialect.sqlToQuery(write.set[field]).sql, `excluded."${columns[field].name}"`);
      }
    }
  }
  const firstPack = writes.findIndex(write => write.key === 'sharePacks');
  const firstDocuments = writes.findIndex(write => write.key === 'documents');
  const firstEvidence = writes.findIndex(write => write.key === 'claimDocuments');
  const discoveryEvidence = writes.findIndex(
    write => write.key === 'claimDocuments' && write.rows.length === 3
  );
  assert.ok(firstPack > firstDocuments && firstEvidence < discoveryEvidence);
});

test('rows reused from role-relationships match the snapshot at the e2e base time', () => {
  const at = (offset = 0) => new Date(Date.parse('2026-01-01T00:00:00.000Z') + offset);
  const expected = buildDiscoverySnapshot();
  const written = buildDiscoveryRowsToWrite();
  const reused = [
    ['claimDocuments', buildRoleRelationshipDocuments({ at })],
    ['claimMessages', buildRoleRelationshipMessages({ at })],
  ] as const;
  for (const [key, rows] of reused) {
    assert.equal(written[key].length, expected[key].length - rows.length);
    for (const row of rows) {
      assert.ok(!written[key].some(candidate => candidate.id === row.id));
      assert.deepEqual(
        collectDiscoverySnapshotViolations({ ...expected, [key]: [row] }).filter(
          failure => failure.includes(row.id) && failure.endsWith('drifted')
        ),
        []
      );
    }
  }
});
