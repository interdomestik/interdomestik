import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { EXCLUDED_MIGRATION_FILES, MIGRATION_FILE_HASHES } from '../src/migration-corpus-manifest';
import { NODE_FS_OPS } from '../src/migration-corpus-node-fs';
import { CANONICAL_ROOT } from '../src/migration-corpus-root';
import { verifyMigrationCorpusRoot } from '../src/migration-corpus-validator';
import { makeTempCorpus } from './migration-corpus.support';

function errorCode(result: Awaited<ReturnType<typeof verifyMigrationCorpusRoot>>) {
  assert.equal(result.ok, false);
  return result.ok ? null : result.error.code;
}

test('manifest binds all 97 canonical files in journal-plus-orphan order', async () => {
  assert.equal(MIGRATION_FILE_HASHES.length, 97);
  for (const hash of MIGRATION_FILE_HASHES) assert.match(hash, /^[a-f0-9]{64}$/);
  const journal = JSON.parse(await readFile(join(CANONICAL_ROOT, 'meta', '_journal.json'), 'utf8'));
  const names = [
    ...journal.entries.map((entry: { tag: string }) => `${entry.tag}.sql`),
    ...EXCLUDED_MIGRATION_FILES,
  ];
  for (let index = 0; index < names.length; index += 1) {
    const bytes = await readFile(join(CANONICAL_ROOT, names[index]));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), MIGRATION_FILE_HASHES[index]);
  }
});

test('journal schema, order and sole timestamp inversion are exact', async () => {
  const journal = JSON.parse(await readFile(join(CANONICAL_ROOT, 'meta', '_journal.json'), 'utf8'));
  assert.deepEqual(Object.keys(journal).sort(), ['dialect', 'entries', 'version']);
  assert.equal(journal.version, '7');
  assert.equal(journal.dialect, 'postgresql');
  assert.equal(journal.entries.length, 93);
  const inversions: number[] = [];
  for (let index = 0; index < journal.entries.length; index += 1) {
    const entry = journal.entries[index];
    assert.deepEqual(Object.keys(entry).sort(), ['breakpoints', 'idx', 'tag', 'version', 'when']);
    assert.equal(entry.idx, index);
    assert.equal(entry.version, '7');
    assert.equal(entry.breakpoints, true);
    assert.match(entry.tag, /^\d{4}_[A-Za-z0-9_-]+$/);
    assert.ok(Number.isSafeInteger(entry.when) && entry.when > 0);
    if (index && entry.when <= journal.entries[index - 1].when) inversions.push(index);
  }
  assert.deepEqual(inversions, [14]);
  assert.deepEqual(
    journal.entries
      .slice(13, 15)
      .map((entry: { tag: string; when: number }) => [entry.tag, entry.when]),
    [
      ['0013_add_agent_clients_unique', 1767890798000],
      ['0014_webhook_events_tenant_nullable', 1767469552201],
    ]
  );
});

test('clean copied corpus verifies before journal tamper', async context => {
  const corpus = await makeTempCorpus(context);
  assert.equal((await verifyMigrationCorpusRoot(corpus.root, NODE_FS_OPS)).ok, true);
  await appendFile(corpus.journal, ' ');
  assert.equal(
    errorCode(await verifyMigrationCorpusRoot(corpus.root, NODE_FS_OPS)),
    'MIGRATION_CORPUS_JOURNAL_REJECTED'
  );
});

test('invalid UTF-8 and malformed JSON are redacted journal failures', async context => {
  const corpus = await makeTempCorpus(context);
  await writeFile(corpus.journal, new Uint8Array([0xff]));
  const invalid = await verifyMigrationCorpusRoot(corpus.root, NODE_FS_OPS);
  assert.equal(errorCode(invalid), 'MIGRATION_CORPUS_JOURNAL_REJECTED');
  assert.equal(JSON.stringify(invalid).includes(corpus.root), false);
  await writeFile(corpus.journal, '{');
  assert.equal(
    errorCode(await verifyMigrationCorpusRoot(corpus.root, NODE_FS_OPS)),
    'MIGRATION_CORPUS_JOURNAL_REJECTED'
  );
});

test('journaled and excluded SQL tamper both fail integrity', async context => {
  for (const index of [0, 96]) {
    const corpus = await makeTempCorpus(context);
    const name = corpus.names[index];
    await appendFile(corpus.file(name), '--tamper');
    assert.equal(
      errorCode(await verifyMigrationCorpusRoot(corpus.root, NODE_FS_OPS)),
      'MIGRATION_CORPUS_FILE_REJECTED'
    );
  }
});
