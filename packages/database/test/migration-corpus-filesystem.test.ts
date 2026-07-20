import assert from 'node:assert/strict';
import { copyFile, link, mkdir, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import test from 'node:test';

import type { CorpusFsOps } from '../src/migration-corpus-contracts';
import { NODE_FS_OPS } from '../src/migration-corpus-node-fs';
import { corpusChild } from '../src/migration-corpus-root';
import { verifyMigrationCorpusRoot } from '../src/migration-corpus-validator';
import { makeTempCorpus } from './migration-corpus.support';

async function code(root: string, ops: Readonly<CorpusFsOps> = NODE_FS_OPS) {
  const result = await verifyMigrationCorpusRoot(root, ops);
  assert.equal(result.ok, false);
  return result.ok ? null : result.error.code;
}

test('missing, additional, renamed and non-regular root entries reject topology', async context => {
  for (const mutation of ['missing', 'additional', 'renamed', 'directory'] as const) {
    const corpus = await makeTempCorpus(context);
    const first = corpus.file(corpus.names[0]);
    if (mutation === 'missing') await rm(first);
    if (mutation === 'additional') await writeFile(corpus.file('extra.sql'), 'select 1');
    if (mutation === 'renamed') await rename(first, corpus.file('renamed.sql'));
    if (mutation === 'directory') {
      await rm(first);
      await mkdir(first);
    }
    const expected =
      mutation === 'additional'
        ? 'MIGRATION_CORPUS_ROOT_REJECTED'
        : 'MIGRATION_CORPUS_TOPOLOGY_REJECTED';
    assert.equal(await code(corpus.root), expected, mutation);
  }
});

test('root and meta symlinks fail closed', async context => {
  const rootCorpus = await makeTempCorpus(context);
  const rootLink = `${rootCorpus.root}-link`;
  context.after(() => rm(rootLink, { force: true }));
  await symlink(rootCorpus.root, rootLink, 'dir');
  assert.equal(await code(rootLink), 'MIGRATION_CORPUS_ROOT_REJECTED');
  const metaCorpus = await makeTempCorpus(context);
  const realMeta = `${metaCorpus.meta}-real`;
  await rename(metaCorpus.meta, realMeta);
  await symlink(realMeta, metaCorpus.meta, 'dir');
  assert.equal(await code(metaCorpus.root), 'MIGRATION_CORPUS_ROOT_REJECTED');
});

test('SQL symlink and hard link cannot authenticate', async context => {
  const symlinkCorpus = await makeTempCorpus(context);
  const source = symlinkCorpus.file(symlinkCorpus.names[0]);
  const outside = `${symlinkCorpus.root}-outside.sql`;
  context.after(() => rm(outside, { force: true }));
  await copyFile(source, outside);
  await rm(source);
  await symlink(outside, source);
  assert.equal(await code(symlinkCorpus.root), 'MIGRATION_CORPUS_TOPOLOGY_REJECTED');
  const hardCorpus = await makeTempCorpus(context);
  const hardOutside = `${hardCorpus.root}-hard.sql`;
  context.after(() => rm(hardOutside, { force: true }));
  await link(hardCorpus.file(hardCorpus.names[0]), hardOutside);
  assert.equal(await code(hardCorpus.root), 'MIGRATION_CORPUS_FILE_REJECTED');
});

test('journal symlink and hard link cannot authenticate', async context => {
  const symlinkCorpus = await makeTempCorpus(context);
  const outside = `${symlinkCorpus.root}-journal`;
  context.after(() => rm(outside, { force: true }));
  await copyFile(symlinkCorpus.journal, outside);
  await rm(symlinkCorpus.journal);
  await symlink(outside, symlinkCorpus.journal);
  assert.equal(await code(symlinkCorpus.root), 'MIGRATION_CORPUS_ROOT_REJECTED');
  const hardCorpus = await makeTempCorpus(context);
  const hardOutside = `${hardCorpus.root}-journal-hard`;
  context.after(() => rm(hardOutside, { force: true }));
  await link(hardCorpus.journal, hardOutside);
  assert.equal(await code(hardCorpus.root), 'MIGRATION_CORPUS_JOURNAL_REJECTED');
});

test('static file and meta snapshot bounds fail closed', async context => {
  const fileCorpus = await makeTempCorpus(context);
  await truncate(fileCorpus.file(fileCorpus.names[0]), 65_537);
  assert.equal(await code(fileCorpus.root), 'MIGRATION_CORPUS_FILE_REJECTED');

  const metaCorpus = await makeTempCorpus(context);
  // prettier-ignore
  await Promise.all(Array.from({ length: 128 }, (_, index) => writeFile(`${metaCorpus.meta}/snapshot-${index}.json`, '{}')));
  assert.equal(await code(metaCorpus.root), 'MIGRATION_CORPUS_ROOT_REJECTED');
});

test('directory handles close and changed postchecks override file rejection', async context => {
  const identityCorpus = await makeTempCorpus(context);
  let closed = 0;
  const identityOps: CorpusFsOps = {
    ...NODE_FS_OPS,
    async openDirectory(path) {
      const handle = await NODE_FS_OPS.openDirectory(path);
      return {
        ...handle,
        async fstatBigint() {
          const stat = await handle.fstatBigint();
          return Object.freeze({ ...stat, ino: stat.ino + 1n });
        },
        async close() {
          closed += 1;
          await handle.close();
        },
      };
    },
  };
  // prettier-ignore
  assert.equal(await code(identityCorpus.root, identityOps), 'MIGRATION_CORPUS_CHANGED_DURING_READ');
  assert.equal(closed, 1);

  const postCorpus = await makeTempCorpus(context);
  const target = postCorpus.names[0];
  let corrupted = false;
  const postOps: CorpusFsOps = {
    ...NODE_FS_OPS,
    async lstatBigint(path) {
      const stat = await NODE_FS_OPS.lstatBigint(path);
      // prettier-ignore
      return corrupted && path === postCorpus.root ? Object.freeze({ ...stat, mtimeNs: stat.mtimeNs + 1n }) : stat;
    },
    async openFile(path) {
      const handle = await NODE_FS_OPS.openFile(path);
      if (!path.endsWith(target)) return handle;
      return {
        ...handle,
        async read(buffer, offset, length, position) {
          const count = await handle.read(buffer, offset, length, position);
          if (position === 0 && count) {
            buffer[offset] ^= 1;
            corrupted = true;
          }
          return count;
        },
      };
    },
  };
  assert.equal(await code(postCorpus.root, postOps), 'MIGRATION_CORPUS_CHANGED_DURING_READ');
});

test('pure child guard rejects traversal, separators, absolute, dot and NUL names', () => {
  for (const name of ['', '.', '..', '../x', 'a/b', 'a\\b', '/tmp/x', 'x\0y']) {
    assert.equal(corpusChild('/safe/root', name), null);
  }
  assert.equal(corpusChild('/safe/root', '0001_safe.sql'), '/safe/root/0001_safe.sql');
});
