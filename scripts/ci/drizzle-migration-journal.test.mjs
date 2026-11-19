import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_TIMESTAMP_INVERSION as PIN,
  journalFailures,
  sqlPathsUnder,
} from '../check-drizzle-migration-journal.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const drizzle = join(root, 'packages/database/drizzle');
const realJournal = readFileSync(join(drizzle, 'meta/_journal.json'), 'utf8');

// A synthetic journal of `count` entries that carries the pinned baseline pair at 13 and 14.
function journal(count = 16, edit = entries => entries) {
  const entries = Array.from({ length: count }, (_, idx) => {
    const tag = `${String(idx).padStart(4, '0')}_m${idx}`;
    return { idx, version: '7', when: PIN.when - 100_000 + idx * 1000, tag, breakpoints: true };
  });
  if (count > PIN.position) {
    Object.assign(entries[PIN.position - 1], { tag: PIN.previousTag, when: PIN.previousWhen });
    Object.assign(entries[PIN.position], { tag: PIN.tag, when: PIN.when });
    for (let idx = PIN.position + 1; idx < count; idx += 1) {
      entries[idx].when = PIN.previousWhen + (idx - PIN.position) * 1000;
    }
  }
  return JSON.stringify({ version: '7', dialect: 'postgresql', entries: edit(entries) });
}
const filesOf = raw => JSON.parse(raw).entries.map(entry => `${entry.tag}.sql`);
const failuresOf = raw => journalFailures(raw, filesOf(raw)).join('\n');

test('the repository journal is valid: no loose file, strict order beyond the pinned pair', () => {
  assert.deepEqual(journalFailures(realJournal, sqlPathsUnder(drizzle)), []);
  const result = spawnSync(process.execPath, ['scripts/check-drizzle-migration-journal.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /loose=0, order=strict/u);
});

test('a valid synthetic journal passes', () => {
  assert.deepEqual(journalFailures(journal(), filesOf(journal())), []);
});

test('missing, empty, unparseable and valid-but-empty journals are refused', () => {
  assert.deepEqual(journalFailures('', []), ['the journal is not valid JSON']);
  assert.deepEqual(journalFailures('{', []), ['the journal is not valid JSON']);
  assert.deepEqual(journalFailures('{}', []), ['the journal has no "entries" array']);
  assert.deepEqual(journalFailures('{"entries":[]}', []), ['the journal has no entries']);
});

test('every SQL file, at any depth and by any name, must be a journaled top-level file', () => {
  const raw = journal();
  for (const loose of [
    '0015_drop_tenant_defaults.sql',
    '9999_anything.sql',
    'backfill.sql',
    'nested/0101_x.sql',
    `nested/${filesOf(raw)[3]}`,
    'UPPER.SQL',
  ]) {
    assert.deepEqual(journalFailures(raw, [...filesOf(raw), loose]), [
      `${loose} is not in the journal; the migrator never applies it`,
    ]);
  }
});

test('the directory listing finds SQL files at any depth and of any case', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-listing-'));
  try {
    mkdirSync(join(dir, 'meta'));
    mkdirSync(join(dir, 'nested/deeper'), { recursive: true });
    for (const file of ['0000_a.sql', 'backfill.sql', 'nested/deeper/x.SQL', 'meta/_journal.json'])
      writeFileSync(join(dir, file), '');
    assert.deepEqual(sqlPathsUnder(dir).sort(), [
      '0000_a.sql',
      'backfill.sql',
      'nested/deeper/x.SQL',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a journal entry without its file is refused', () => {
  const raw = journal();
  const [, ...rest] = filesOf(raw);
  assert.deepEqual(journalFailures(raw, rest), [
    'the journal names 0000_m0.sql, which does not exist',
  ]);
});

test('a new inversion, an equal timestamp, a wrong index, timestamp or tag is refused', () => {
  const equal = journal(16, entries => {
    entries[15].when = entries[14].when;
    return entries;
  });
  assert.match(failuresOf(equal), /entries\[15\].*not later than every entry/u);
  const misindexed = journal(16, entries => {
    entries[3].idx = 4;
    return entries;
  });
  assert.match(failuresOf(misindexed), /entries\[3\] has idx 4/u);
  const untimed = journal(16, entries => {
    delete entries[2].when;
    return entries;
  });
  assert.match(failuresOf(untimed), /no valid timestamp/u);
  const mislabelled = journal(16, entries => {
    entries[5].tag = '0006_m5';
    return entries;
  });
  assert.match(failuresOf(mislabelled), /does not carry its index/u);
});

test('an entry after the pinned pair must exceed the earlier maximum, not only its neighbour', () => {
  const reused = journal(16, entries => {
    entries[15].when = PIN.previousWhen;
    return entries;
  });
  assert.match(failuresOf(reused), /entries\[15\].*not later than every entry/u);
  const between = journal(16, entries => {
    entries[15].when = PIN.previousWhen - 1;
    return entries;
  });
  assert.match(failuresOf(between), /entries\[15\]/u);
});

test('the pinned pair cannot move, change its timestamps or tags, or disappear', () => {
  const edits = {
    healed: entries => Object.assign(entries[14], { when: PIN.previousWhen + 1 }) && entries,
    retimed: entries => Object.assign(entries[14], { when: PIN.when - 1 }) && entries,
    renamed: entries => Object.assign(entries[14], { tag: '0014_other' }) && entries,
    previousRetimed: entries =>
      Object.assign(entries[13], { when: PIN.previousWhen + 1 }) && entries,
  };
  for (const [name, edit] of Object.entries(edits)) {
    assert.match(failuresOf(journal(16, edit)), /pinned baseline inversion/u, name);
  }
  assert.match(failuresOf(journal(10)), /pinned baseline inversion/u);
});

test('a tag is one plain file name, compared as written', () => {
  // Trailing whitespace: the files on disk carry the clean name, the migrator reads the raw tag.
  const spaced = journal(16, entries => {
    entries[15].tag = `${entries[15].tag} `;
    return entries;
  });
  const clean = filesOf(journal());
  assert.match(journalFailures(spaced, clean).join('\n'), /entries\[15\] tag "0015_m15 " is not/u);
  // A nested tag with a matching nested file is refused too: every migration is top-level.
  const nested = journal(16, entries => {
    entries[15].tag = '0015_dir/m15';
    return entries;
  });
  assert.match(failuresOf(nested), /entries\[15\] tag "0015_dir\/m15" is not one plain file name/u);
  // The live journal's one hyphenated tag stays a plain name.
  const hyphen = journal(16, entries => {
    entries[15].tag = '0015_add-status';
    return entries;
  });
  assert.equal(failuresOf(hyphen), '');
});
