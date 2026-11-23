import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { auditContract, CONTRACT_PATH, runTrackAudit } from '../track-audit.mjs';

// `pnpm track:audit` runs in the required check `audit`. Defect class: a contract audit that
// passes without checking (no checks, a target that matches nothing, an exclusion that hides a
// file without a reason or after the file stopped violating).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quiet = { log() {}, error() {} };

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idct-track-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function audit(files, checks) {
  const dir = fixture(files);
  try {
    return auditContract({ version: 1, checks }, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const SRC = { 'src/a.ts': 'import x from "seed";\n', 'src/b.ts': 'const ok = 1;\n' };
const noSeed = extra => ({
  id: 'no_seed',
  type: 'regex',
  targets: ['src/*.ts'],
  must_not_match: ['seed'],
  ...extra,
});
const reason = 'a test that reads seed rows as expected data';

test('track audit: the repository contract passes', () => {
  assert.equal(runTrackAudit(root, quiet), 0);
});

test('track audit: the repository exclusion list holds exactly the one approved entry', () => {
  const contract = yaml.load(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
  const entries = contract.checks.flatMap(check =>
    (check.exclude ?? []).map(entry => `${check.id} ${entry.file}`)
  );
  assert.deepEqual(entries, [
    'seeding.no_seed_imports_outside_database apps/web/src/features/admin/verification/server/mutations/resubmit-attempt.test.ts',
  ]);
});

test('track audit: missing, unparseable, empty and valid-but-empty contracts fail', () => {
  const cases = {
    missing: {},
    unparseable: { [CONTRACT_PATH]: 'checks: [\n' },
    empty: { [CONTRACT_PATH]: '' },
    'no checks': { [CONTRACT_PATH]: 'version: 1\nchecks: []\n' },
  };
  for (const [name, files] of Object.entries(cases)) {
    const dir = fixture(files);
    try {
      assert.equal(runTrackAudit(dir, quiet), 1, name);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('track audit: a check without targets, of an unknown type or matching no file fails', () => {
  assert.match(audit(SRC, [{ id: 'x', type: 'regex', must_match: ['a'] }])[0], /has no targets/u);
  assert.match(audit(SRC, [{ id: 'x', type: 'grep', targets: ['src/a.ts'] }])[0], /unknown type/u);
  const empty = audit(SRC, [noSeed({ targets: ['src/*.ts', 'gone/*.ts'] })]);
  assert.ok(
    empty.some(failure => /no file matches gone\/\*\.ts/u.test(failure)),
    empty.join('\n')
  );
});

test('track audit: regex, file_exists and file_not_exists report violations', () => {
  assert.deepEqual(audit({ 'src/b.ts': 'const ok = 1;\n' }, [noSeed()]), []);
  assert.match(audit(SRC, [noSeed()]).join('\n'), /src\/a\.ts must NOT match regex 'seed'/u);
  const mustMatch = { id: 'm', type: 'regex', targets: ['src/b.ts'], must_match: ['seed'] };
  assert.match(audit(SRC, [mustMatch])[0], /src\/b\.ts must match regex 'seed'/u);
  assert.match(
    audit(SRC, [{ id: 'e', type: 'file_exists', targets: ['src/c.ts'] }])[0],
    /not found/u
  );
  assert.match(
    audit(SRC, [{ id: 'n', type: 'file_not_exists', targets: ['src/a.*'] }])[0],
    /SHOULD NOT exist: src\/a\.ts/u
  );
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
