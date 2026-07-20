import assert from 'node:assert/strict';
import { appendFile, rename, rm, truncate, writeFile } from 'node:fs/promises';
import test from 'node:test';

import type { CorpusFsOps, CorpusStage } from '../src/migration-corpus-contracts';
import { NODE_FS_OPS } from '../src/migration-corpus-node-fs';
import { verifyMigrationCorpusRoot } from '../src/migration-corpus-validator';
import { makeTempCorpus } from './migration-corpus.support';

async function code(root: string, ops: Readonly<CorpusFsOps>) {
  const result = await verifyMigrationCorpusRoot(root, ops);
  assert.equal(result.ok, false);
  return result.ok ? null : result.error.code;
}

test('missing mandatory flags fails before filesystem I/O', async () => {
  let calls = 0;
  const ops: CorpusFsOps = {
    ...NODE_FS_OPS,
    noFollowFlag: 0,
    directoryFlag: 0,
    async lstatBigint(path) {
      calls += 1;
      return NODE_FS_OPS.lstatBigint(path);
    },
  };
  assert.equal(await code('/not-read', ops), 'MIGRATION_CORPUS_PLATFORM_UNSUPPORTED');
  assert.equal(calls, 0);
});

test('truncate, replace and growth across the read window map to changed', async context => {
  for (const action of ['truncate', 'replace', 'grow'] as const) {
    const corpus = await makeTempCorpus(context);
    const target = corpus.names[0];
    const trigger: CorpusStage = action === 'grow' ? 'after_read' : 'after_open';
    let injected = false;
    const ops: CorpusFsOps = {
      ...NODE_FS_OPS,
      async onStage(stage, name) {
        if (injected || stage !== trigger || name !== target) return;
        injected = true;
        const path = corpus.file(target);
        if (action === 'truncate') await truncate(path, 0);
        if (action === 'grow') await appendFile(path, 'x');
        if (action === 'replace') {
          await rename(path, `${path}.old`);
          await writeFile(path, 'replacement');
        }
      },
    };
    assert.equal(await code(corpus.root, ops), 'MIGRATION_CORPUS_CHANGED_DURING_READ');
  }
});

test('post-observation disappearance is changed and initial OS errors are redacted', async context => {
  const corpus = await makeTempCorpus(context);
  let removed = false;
  const postOps: CorpusFsOps = {
    ...NODE_FS_OPS,
    async onStage(stage, name) {
      if (!removed && stage === 'before_postcheck' && name === corpus.names[0]) {
        removed = true;
        await rm(corpus.file(name));
      }
    },
  };
  assert.equal(await code(corpus.root, postOps), 'MIGRATION_CORPUS_CHANGED_DURING_READ');
  const sentinel = 'SENTINEL_EACCES_PATH';
  const initial: CorpusFsOps = {
    ...NODE_FS_OPS,
    async lstatBigint() {
      throw new Error(sentinel);
    },
  };
  const result = await verifyMigrationCorpusRoot(corpus.root, initial);
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'MIGRATION_CORPUS_ROOT_REJECTED' },
  });
  assert.equal(JSON.stringify(result).includes(sentinel), false);
  const journalOps: CorpusFsOps = {
    ...NODE_FS_OPS,
    async realpath(path) {
      if (path.endsWith('_journal.json')) throw new Error(sentinel);
      return NODE_FS_OPS.realpath(path);
    },
  };
  assert.equal(await code(corpus.root, journalOps), 'MIGRATION_CORPUS_JOURNAL_REJECTED');
});

test('all handles and streams close; close failure overrides success', async context => {
  const corpus = await makeTempCorpus(context);
  let opened = 0;
  let closed = 0;
  const counted: CorpusFsOps = {
    ...NODE_FS_OPS,
    async openFile(path) {
      opened += 1;
      const handle = await NODE_FS_OPS.openFile(path);
      return {
        ...handle,
        async close() {
          await handle.close();
          closed += 1;
        },
      };
    },
    async openDirectory(path) {
      opened += 1;
      const handle = await NODE_FS_OPS.openDirectory(path);
      return {
        ...handle,
        async close() {
          await handle.close();
          closed += 1;
        },
      };
    },
    async streamDirectory(path) {
      opened += 1;
      const stream = await NODE_FS_OPS.streamDirectory(path);
      return {
        [Symbol.asyncIterator]: () => stream[Symbol.asyncIterator](),
        async close() {
          await stream.close();
          closed += 1;
        },
      };
    },
  };
  assert.equal((await verifyMigrationCorpusRoot(corpus.root, counted)).ok, true);
  assert.equal(closed, opened);
  const broken: CorpusFsOps = {
    ...NODE_FS_OPS,
    async openFile(path) {
      const handle = await NODE_FS_OPS.openFile(path);
      return {
        ...handle,
        async close() {
          await handle.close();
          throw new Error('close');
        },
      };
    },
  };
  assert.equal(await code(corpus.root, broken), 'MIGRATION_CORPUS_CLEANUP_FAILED');
});
