import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import yaml from 'js-yaml';

import { CONTRACT_PATH } from '../track-audit.mjs';
import { audit, noSeed, reason, root, SRC } from './track-audit-fixtures.mjs';

// `pnpm track:audit` runs in the required check `audit`. Defect class: a contract audit that
// passes without checking (no checks, a target that matches nothing, an exclusion that hides a
// file without a reason or after the file stopped violating).
// This file: the `exclude:` list.

test('track audit: the repository exclusion list holds exactly the one approved entry', () => {
  const contract = yaml.load(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
  const entries = contract.checks.flatMap(check =>
    (check.exclude ?? []).map(entry => `${check.id} ${entry.file}`)
  );
  assert.deepEqual(entries, [
    'seeding.no_seed_imports_outside_database apps/web/src/features/admin/verification/server/mutations/resubmit-attempt.test.ts',
  ]);
});

test('track audit: a valid exclusion skips only its file', () => {
  assert.deepEqual(audit(SRC, [noSeed({ exclude: [{ file: 'src/a.ts', reason }] })]), []);
  const other = { ...SRC, 'src/c.ts': 'seed again\n' };
  const failures = audit(other, [noSeed({ exclude: [{ file: 'src/a.ts', reason }] })]);
  assert.deepEqual(failures, ["Check no_seed failed: src/c.ts must NOT match regex 'seed'"]);
});

test('track audit: an entry without a file or a reason fails, and its file is still checked', () => {
  for (const entry of [
    { file: 'src/a.ts' },
    { file: 'src/a.ts', reason: '   ' },
    { file: 'src/a.ts', reason: 7 },
    { reason },
    'src/a.ts',
  ]) {
    const failures = audit(SRC, [noSeed({ exclude: [entry] })]);
    assert.ok(
      failures.some(f => /needs a file and a non-empty reason/u.test(f)),
      String(entry)
    );
    assert.ok(
      failures.some(f => /src\/a\.ts must NOT match/u.test(f)),
      String(entry)
    );
  }
});

test('track audit: a stale entry fails (file gone, or no longer violating)', () => {
  const gone = audit(SRC, [noSeed({ exclude: [{ file: 'src/gone.ts', reason }] })]);
  assert.ok(
    gone.some(f => /'src\/gone\.ts' is stale: file not found/u.test(f)),
    gone.join('\n')
  );
  const clean = audit(SRC, [noSeed({ exclude: [{ file: 'src/b.ts', reason }] })]);
  assert.ok(
    clean.some(f => /'src\/b\.ts' is stale: the file no longer violates the check/u.test(f)),
    clean.join('\n')
  );
});

test('track audit: an entry outside the targets, a duplicate or a malformed list fails', () => {
  const files = { ...SRC, 'lib/d.ts': 'seed\n' };
  const outside = audit(files, [noSeed({ exclude: [{ file: 'lib/d.ts', reason }] })]);
  assert.ok(
    outside.some(f => /not matched by the check's targets/u.test(f)),
    outside.join('\n')
  );
  const twice = audit(SRC, [
    noSeed({
      exclude: [
        { file: 'src/a.ts', reason },
        { file: 'src/a.ts', reason },
      ],
    }),
  ]);
  assert.ok(
    twice.some(f => /listed twice/u.test(f)),
    twice.join('\n')
  );
  for (const exclude of [[], {}, 'src/a.ts']) {
    const failures = audit(SRC, [noSeed({ exclude })]);
    assert.ok(
      failures.some(f => /exclude must be a non-empty list/u.test(f)),
      String(exclude)
    );
    assert.ok(
      failures.some(f => /src\/a\.ts must NOT match/u.test(f)),
      String(exclude)
    );
  }
  const onFileCheck = { id: 'e', type: 'file_exists', targets: ['src/a.ts'], exclude: [] };
  assert.match(audit(SRC, [onFileCheck])[0], /exclude must be a non-empty list on a regex check/u);
});

test('track audit: an entry with an unsupported key, or a duplicate, leaves its file checked', () => {
  const violation = /src\/a\.ts must NOT match regex 'seed'/u;
  const extra = audit(SRC, [noSeed({ exclude: [{ file: 'src/a.ts', reason, pattern: 'x' }] })]);
  assert.ok(
    extra.some(f => /unsupported keys: pattern/u.test(f)),
    extra.join('\n')
  );
  assert.ok(
    extra.some(f => violation.test(f)),
    extra.join('\n')
  );
  const twice = audit(SRC, [
    noSeed({
      exclude: [
        { file: 'src/a.ts', reason },
        { file: 'src/a.ts', reason },
      ],
    }),
  ]);
  assert.ok(
    twice.some(f => violation.test(f)),
    twice.join('\n')
  );
  const mixed = audit(SRC, [
    noSeed({ exclude: [{ file: 'src/a.ts' }, { file: 'src/a.ts', reason }] }),
  ]);
  assert.ok(
    mixed.some(f => violation.test(f)),
    mixed.join('\n')
  );
});
