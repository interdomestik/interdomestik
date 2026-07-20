import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { CorpusFsOps } from '../src/migration-corpus-contracts';
import { CorpusFault } from '../src/migration-corpus-contracts';
import { verifyCanonicalMigrationCorpus } from '../src/migration-corpus-capability';
import { withCorpusDirectories } from '../src/migration-corpus-directories';
import { readCorpusFile } from '../src/migration-corpus-files';
import { NODE_FS_OPS } from '../src/migration-corpus-node-fs';
import { verifyMigrationCorpusRoot } from '../src/migration-corpus-validator';
import { makeTempCorpus } from './migration-corpus.support';

const SUMMARY = Object.freeze({
  contract_version: 'canonical_migration_corpus_v1',
  integrity_verified: true,
  journaled_migrations: 93,
  excluded_legacy_orphans: 4,
  sql_files: 97,
});

test('verifies the canonical corpus and returns only the frozen summary', async () => {
  const result = await verifyCanonicalMigrationCorpus();
  assert.equal(result.ok, true);
  assert.ok(Object.isFrozen(result));
  if (!result.ok) return;
  assert.ok(Object.isFrozen(result.capability));
  assert.deepEqual(result.capability.toJSON(), SUMMARY);
  assert.deepEqual(Object.keys(result.capability), []);
  assert.deepEqual(Object.getOwnPropertySymbols(result.capability), []);
});

test('canonical resolution is independent of cwd and calls are distinct', async () => {
  const original = process.cwd();
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'ida-corpus-cwd-')));
  try {
    process.chdir(temp);
    const first = await verifyCanonicalMigrationCorpus();
    const second = await verifyCanonicalMigrationCorpus();
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.notEqual(first.capability, second.capability);
    assert.deepEqual(first.capability.toJSON(), second.capability.toJSON());
  } finally {
    process.chdir(original);
    await rm(temp, { recursive: true, force: true });
  }
});

test('cleanup remains dominant across task and directory failures', async context => {
  const corpus = await makeTempCorpus(context);
  const ops: CorpusFsOps = {
    ...NODE_FS_OPS,
    async onStage(stage, name) {
      if (stage === 'before_postcheck' && name === '.') throw new Error('postcheck');
    },
  };
  await assert.rejects(
    withCorpusDirectories(corpus.root, ops, async () => {
      throw new CorpusFault('MIGRATION_CORPUS_CLEANUP_FAILED');
    }),
    error => error instanceof CorpusFault && error.code === 'MIGRATION_CORPUS_CLEANUP_FAILED'
  );
});

test('iterator close failure overrides root snapshot work', async context => {
  const corpus = await makeTempCorpus(context);
  const ops: CorpusFsOps = {
    ...NODE_FS_OPS,
    async streamDirectory(path) {
      const stream = await NODE_FS_OPS.streamDirectory(path);
      return {
        [Symbol.asyncIterator]: () => stream[Symbol.asyncIterator](),
        async close() {
          await stream.close();
          throw new Error('close');
        },
      };
    },
  };
  const result = await verifyMigrationCorpusRoot(corpus.root, ops);
  assert.equal(result.ok ? null : result.error.code, 'MIGRATION_CORPUS_CLEANUP_FAILED');
});

test('remaining aggregate budget rejects before file open or allocation', async context => {
  const corpus = await makeTempCorpus(context);
  let opened = false;
  const ops: CorpusFsOps = {
    ...NODE_FS_OPS,
    async openFile(path) {
      opened = true;
      return NODE_FS_OPS.openFile(path);
    },
  };
  await assert.rejects(
    readCorpusFile(
      corpus.root,
      corpus.root,
      corpus.names[0],
      corpus.names[0],
      'MIGRATION_CORPUS_FILE_REJECTED',
      0n,
      ops
    ),
    error => error instanceof CorpusFault && error.code === 'MIGRATION_CORPUS_FILE_REJECTED'
  );
  assert.equal(opened, false);
});
