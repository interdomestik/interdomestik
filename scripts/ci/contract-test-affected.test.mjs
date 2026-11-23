import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  AREA_TABLE,
  parseArgs,
  selectContractWork,
  testSetChange,
  unrecognizedEntry,
} from './contract-test-affected.mjs';
import { inputClosure, inventory } from './contract-test-inputs.mjs';
import { contractTestPlan } from './contract-test-shards.mjs';

const byText = (left, right) => left.localeCompare(right);
const root = path.resolve(import.meta.dirname, '../..');

const E2E_TEST = 'scripts/ci/e2e-lanes.test.mjs';
const PLAN_TEST = 'scripts/ci/contract-test-shards.test.mjs';
const OTHER_TEST = 'scripts/ci/other.test.mjs';
const SCAN_TEST = 'scripts/ci/workflows.test.mjs';
const closures = {
  [E2E_TEST]: { files: new Set([E2E_TEST]), dirs: new Set(), scanner: false },
  [PLAN_TEST]: {
    files: new Set([PLAN_TEST, '.github/workflows/ci.yml']),
    dirs: new Set(),
    scanner: true,
  },
  [OTHER_TEST]: { files: new Set([OTHER_TEST]), dirs: new Set(['packages/x/']), scanner: false },
  [SCAN_TEST]: {
    files: new Set([SCAN_TEST]),
    dirs: new Set(['.github/workflows/']),
    scanner: true,
  },
};
const select = (changed, extra = {}) =>
  selectContractWork({
    tests: Object.keys(closures),
    closureOf: file => closures[file],
    changed,
    structural: undefined,
    e2eClosure: { files: new Set(['scripts/check-e2e-contracts.mjs']), dirs: new Set() },
    ...extra,
  });

test('runner, lockfile and wiring changes fall back to both full commands', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.nvmrc',
    'scripts/ci/contract-test-shards.mjs',
    'scripts/ci/contract-test-scratch.mjs',
    'scripts/ci/contract-test-inputs.mjs',
    'scripts/ci/contract-test-affected.mjs',
    'scripts/lib/modularity-guard.mjs',
  ]) {
    assert.equal(select(['docs/a.md', file]).full, `${file} changed`);
  }
  assert.match(select(['x'], { e2eClosure: null }).full, /wiring/u);
});

test('the E2E area selects the e2e-* contract tests and the E2E command', () => {
  for (const file of ['apps/web/e2e/specs/a.spec.ts', 'apps/web/playwright.config.ts']) {
    const work = select([file]);
    assert.equal(work.full, null);
    assert.deepEqual([...work.selected.keys()], [E2E_TEST]);
    assert.equal(work.e2e, file);
  }
  const checker = 'scripts/check-e2e-contracts.mjs';
  assert.equal(select([checker]).e2e, checker);
  assert.ok(AREA_TABLE.some(entry => entry.area === 'apps/web/e2e' && entry.e2e));
});

test('a .github change selects named consumers and scanners of its directory only', () => {
  const work = select(['.github/workflows/ci.yml']);
  assert.deepEqual([...work.selected.keys()].sort(byText), [PLAN_TEST, SCAN_TEST].sort(byText));
  const other = select(['.github/dependabot.yml']);
  assert.equal(other.selected.size, 0);
  assert.equal(other.e2e, null);
});

test('test-set changes select the runner test; unrelated changes select nothing', () => {
  const work = select(['scripts/ci/new.test.mjs'], { structural: 'scripts/ci/new.test.mjs' });
  assert.deepEqual([...work.selected.keys()], [PLAN_TEST]);
  const none = select(['docs/readme.md']);
  assert.equal(none.full, null);
  assert.equal(none.selected.size, 0);
  assert.equal(none.e2e, null);
  assert.equal(select(['packages/x/src/a.ts']).selected.get(OTHER_TEST), 'packages/x/src/a.ts');
});

test('the test-set rule reads both sides of a rename and ignores modifications', () => {
  const entry = (status, file, oldPath = null) => ({ status, file, oldPath });
  const added = 'scripts/ci/new.test.mjs';
  assert.equal(testSetChange([entry('R', added, 'scripts/ci/helper.mjs')]), added);
  assert.equal(
    testSetChange([entry('R', 'scripts/ci/helper.mjs', added)]),
    'scripts/ci/helper.mjs'
  );
  assert.equal(testSetChange([entry('A', added)]), added);
  assert.equal(testSetChange([entry('D', added)]), added);
  assert.equal(testSetChange([entry('M', added)]), undefined);
  assert.equal(testSetChange([entry('A', 'scripts/ci/fixtures/x.test.mjs')]), undefined);
});

test('fail safe: an unrecognized diff entry, and a test with an unresolved import always runs', () => {
  const ok = { file: 'ok', oldPath: null, status: 'M' };
  for (const entry of [
    { file: 'a', oldPath: null, status: 'X' },
    { file: 'a', oldPath: null, status: 'U' },
    { file: undefined, oldPath: null, status: 'M' },
    { file: 'b', oldPath: undefined, status: 'R' },
  ]) {
    assert.match(
      unrecognizedEntry([ok, entry]),
      /^unrecognized diff entry /u,
      JSON.stringify(entry)
    );
  }
  const known = ['A', 'C', 'D', 'M', 'R', 'T'].map(status => ({
    file: 'f',
    oldPath: ['R', 'C'].includes(status) ? 'g' : null,
    status,
  }));
  assert.equal(unrecognizedEntry(known), null);
  const unresolved = {
    ...closures[OTHER_TEST],
    unresolved: '@interdomestik/ghost (imported by x)',
  };
  const work = select(['docs/unrelated.md'], {
    closureOf: file => (file === OTHER_TEST ? unresolved : closures[file]),
  });
  assert.deepEqual([...work.selected.keys()], [OTHER_TEST]);
  assert.equal(
    work.selected.get(OTHER_TEST),
    'unresolved import @interdomestik/ghost (imported by x)'
  );
});

test('arguments are no ref or exactly --base with a ref that is not an option', () => {
  assert.equal(parseArgs([]), 'origin/main');
  assert.equal(parseArgs(['--base', 'main']), 'main');
  for (const argv of [['--base'], ['--base', '--independent'], ['--fast'], ['--base', 'a', 'b']]) {
    assert.equal(parseArgs(argv), null, argv.join(' '));
  }
});

test('on this repository the tenant-host lane and the workflow audit are reachable', () => {
  const files = execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const tracked = inventory(files);
  const read = file => {
    try {
      return fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  const tests = Object.values(contractTestPlan(root).shards).flat();
  const run = changed =>
    selectContractWork({
      tests,
      closureOf: file => inputClosure(file, read, tracked),
      changed,
      structural: undefined,
      e2eClosure: { files: new Set(), dirs: new Set() },
    });
  const e2e = run(['apps/web/e2e/auth.spec.ts']);
  assert.ok(e2e.selected.has('scripts/ci/e2e-tenant-host-lanes.test.mjs'));
  assert.equal(e2e.e2e, 'apps/web/e2e/auth.spec.ts');
  assert.ok(run(['.github/workflows/ci.yml']).selected.has(PLAN_TEST));
});
