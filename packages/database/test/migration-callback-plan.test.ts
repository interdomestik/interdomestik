import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';

import { migrate as proxyMigrate } from 'drizzle-orm/pg-proxy/migrator';

import { verifyCanonicalMigrationCorpus } from '../src/migration-corpus-capability';
import { CANONICAL_ROOT } from '../src/migration-corpus-root';
import { buildOwnedMigrationCallbackPlan } from '../src/migration-callback-plan-builder';
import {
  buildCanonicalMigrationCallbackPlan,
  testMigrationCallbackPlanWithDependencies,
  type MigrationCallbackPlanDependencies,
} from '../src/migration-callback-plan';
import { canonicalReader, canonicalReaderResult } from './migration-callback.support';

test('authentic corpus builds the exact frozen callback-plan summary', async () => {
  const corpus = await verifyCanonicalMigrationCorpus();
  assert.equal(corpus.ok, true);
  if (!corpus.ok) return;

  const result = await buildCanonicalMigrationCallbackPlan(corpus.capability);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(JSON.parse(JSON.stringify(result.capability)), {
    contract_version: 'canonical_pg_proxy_callback_plan_v1',
    drizzle_orm_version: '0.45.2',
    journaled_migrations: 93,
    statement_chunks: 750,
    callback_items: 843,
    callback_plan_sha256: 'f4486654346a7e7c66a5cdbff57f4611268b1c5144e0ab7cea3ac3a1b7e2ab3f',
  });
  assert.ok(Object.isFrozen(result.capability));
});

test('capabilities are distinct, opaque, immutable and CWD independent', async () => {
  const corpus = await verifyCanonicalMigrationCorpus();
  assert.equal(corpus.ok, true);
  if (!corpus.ok) return;
  const prior = process.cwd();
  process.chdir('/');
  try {
    const [left, right] = await Promise.all([
      buildCanonicalMigrationCallbackPlan(corpus.capability),
      buildCanonicalMigrationCallbackPlan(corpus.capability),
    ]);
    assert.equal(left.ok && right.ok, true);
    if (!left.ok || !right.ok) return;
    assert.notEqual(left.capability, right.capability);
    assert.deepEqual(Object.getOwnPropertyNames(left.capability), []);
    assert.deepEqual(Object.getOwnPropertySymbols(left.capability), []);
    const shown = `${inspect(left.capability)} ${JSON.stringify(left.capability)}`;
    assert.equal(shown.includes('INSERT'), false);
    assert.equal(shown.includes('/drizzle'), false);
  } finally {
    process.chdir(prior);
  }
});

test('pure pg-proxy parity emits the same one flat full-corpus callback', async () => {
  const entries = await canonicalReaderResult();
  const local = buildOwnedMigrationCallbackPlan(entries);
  const calls: unknown[] = [];
  const db = {
    execute: async (query: unknown) => {
      calls.push(query);
      return calls.length === 3 ? [] : undefined;
    },
  };
  let captured: readonly string[] | undefined;
  await proxyMigrate(
    db as never,
    async queries => {
      captured = queries;
    },
    {
      migrationsFolder: CANONICAL_ROOT,
    }
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(captured, local.callbackItems);
  assert.equal(captured?.length, 843);
});

test('forged corpus fails before dependency resolution', async () => {
  const result = await buildCanonicalMigrationCallbackPlan({} as never);
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'MIGRATION_CALLBACK_CORPUS_CAPABILITY_REJECTED',
    },
  });
});

test('reader runs once before the required unequal post-corpus scan rejects', async () => {
  const reader = await canonicalReader();
  const input = {},
    postCapability = {};
  const events: string[] = [];
  // prettier-ignore
  const identity = Object.freeze({ dev: 1n, ino: 2n, nlink: 1n, size: 3n, mtimeNs: 4n, ctimeNs: 5n, kind: 'directory' as const });
  // prettier-ignore
  const pre = Object.freeze({ realRoot: CANONICAL_ROOT, journalSha256: 'journal', corpusSha256: 'corpus', journalNames: Object.freeze(['one']), excludedNames: Object.freeze(['orphan']), rootIdentity: identity });
  const post = Object.freeze({ ...pre, corpusSha256: 'changed' });
  const dependencies = (
    read: typeof reader,
    failRecheck = false
  ): MigrationCallbackPlanDependencies => ({
    readCorpus: value => (value === input ? pre : value === postCapability ? post : null),
    verifyCorpus: async () => {
      events.push('post');
      return { ok: true as const, capability: postCapability as never };
    },
    bindSources: async () => ({
      packageRoot: '/package',
      hashes: Object.freeze([]),
      urls: Object.freeze([]),
      reader: config => {
        events.push('reader');
        return read(config);
      },
    }),
    recheckSources: async () => {
      events.push('recheck');
      if (failRecheck) throw new Error('changed dependency');
    },
  });
  let code = await testMigrationCallbackPlanWithDependencies(input, dependencies(reader));
  assert.deepEqual(events, ['reader', 'post', 'recheck']);
  assert.equal(code, 'MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ');
  const drift = await canonicalReaderResult();
  drift[0].sql[0] += ' ';
  code = await testMigrationCallbackPlanWithDependencies(
    input,
    dependencies(() => drift)
  );
  assert.equal(code, 'MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ');
  code = await testMigrationCallbackPlanWithDependencies(
    input,
    dependencies(() => drift, true)
  );
  assert.equal(code, 'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
});
