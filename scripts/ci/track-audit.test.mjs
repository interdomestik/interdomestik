import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import yaml from 'js-yaml';

import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';
import { CONTRACT_PATH, runTrackAudit } from '../track-audit.mjs';
import { audit, fixture, noSeed, quiet, reason, root, SRC } from './track-audit-fixtures.mjs';

// `pnpm track:audit` runs in the required check `audit`. Defect class: a contract audit that
// passes without checking (no checks, a target that matches nothing, an exclusion that hides a
// file without a reason or after the file stopped violating).
// This file: contract loading, check shapes, targets and the command's exit code.

test('track audit: the repository contract passes', () => {
  assert.equal(runTrackAudit(root, quiet), 0);
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

test('track audit: a regex check without patterns, or with an unknown key, fails', () => {
  const target = { id: 'r', type: 'regex', targets: ['src/b.ts'] };
  for (const check of [
    target,
    { ...target, must_match: [], must_not_match: [] },
    { ...target, must_matches: ['seed'] },
    { ...target, must_match: [7] },
    { ...target, must_match: 'seed' },
  ]) {
    const failures = audit(SRC, [check]);
    assert.ok(
      failures.some(f =>
        /has no patterns|unsupported keys|not a list of non-empty strings/u.test(f)
      ),
      `${JSON.stringify(check)}: ${failures.join('\n')}`
    );
  }
});

test('track audit: the command exits 1 on a failing contract and 0 on a passing one', () => {
  const script = path.join(root, 'scripts/track-audit.mjs');
  const contract = checks => yaml.dump({ version: 1, checks });
  for (const [checks, status] of [
    [[noSeed()], 1],
    [[noSeed({ exclude: [{ file: 'src/a.ts', reason }] })], 0],
  ]) {
    const dir = fixture({ ...SRC, [CONTRACT_PATH]: contract(checks) });
    try {
      const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
      assert.equal(run.status, status, `${run.stdout}${run.stderr}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('track audit: a file check with patterns, or a blank target, fails', () => {
  const exists = { id: 'e', type: 'file_exists', targets: ['src/a.ts'] };
  for (const check of [
    { ...exists, must_not_match: ['seed'] },
    { ...exists, must_match: ['nothing'] },
    { ...exists, targets: [''] },
    { ...exists, targets: ['  '] },
    { ...exists, targets: [7] },
    { id: 'r', type: 'regex', targets: [''], must_match: ['a'] },
  ]) {
    const failures = audit(SRC, [check]);
    assert.ok(
      failures.some(f => /regex-only keys|not a non-empty path/u.test(f)),
      `${JSON.stringify(check)}: ${failures.join('\n')}`
    );
  }
});

test('track audit: optional targets may match nothing but are still checked when they match', () => {
  assert.deepEqual(
    audit(SRC, [noSeed({ targets: ['src/b.ts'], optional_targets: ['gone/**/*.ts'] })]),
    []
  );
  const back = audit({ ...SRC, 'gone/x/assign.ts': 'seed\n' }, [
    noSeed({ targets: ['src/b.ts'], optional_targets: ['gone/**/*.ts'] }),
  ]);
  assert.deepEqual(back, ["Check no_seed failed: gone/x/assign.ts must NOT match regex 'seed'"]);
  const required = audit(SRC, [noSeed({ targets: ['gone/*.ts'], optional_targets: ['src/*.ts'] })]);
  assert.ok(
    required.some(f => /no file matches gone\/\*\.ts/u.test(f)),
    required.join('\n')
  );
  for (const optional of [[], [''], 'gone/*.ts', [7]]) {
    const failures = audit(SRC, [noSeed({ targets: ['src/b.ts'], optional_targets: optional })]);
    assert.ok(
      failures.some(f => /optional_targets that are not/u.test(f)),
      String(optional)
    );
  }
  const onFile = { id: 'e', type: 'file_exists', targets: ['src/a.ts'], optional_targets: ['x'] };
  assert.match(
    audit(SRC, [onFile])[0],
    /regex-only keys on a file_exists check: optional_targets/u
  );
});

test('track audit: the delivery contract has its structured-artifact owner', () => {
  assert.equal(structuredArtifactOwner(CONTRACT_PATH), 'track-audit-contract');
});
