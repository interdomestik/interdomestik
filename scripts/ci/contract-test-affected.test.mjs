import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AREA_TABLE,
  FULL_FALLBACK,
  commandScripts,
  main,
  selectContractWork,
} from './contract-test-affected.mjs';
import { inputClosure, inventory, resolveLiteral, touches } from './contract-test-inputs.mjs';
import { contractTestPlan } from './contract-test-shards.mjs';

const byText = (left, right) => left.localeCompare(right);
const root = path.resolve(import.meta.dirname, '../..');
const sources = files => file => files[file];
const closureFor = (files, test, extra = []) =>
  inputClosure(test, sources(files), inventory([...Object.keys(files), ...extra]));

test('literals resolve relative to the file only for ./ and ../, else from the root', () => {
  const tracked = inventory([
    'scripts/ci/helper.mjs',
    'scripts/lib/util.mjs',
    '.github/workflows/ci.yml',
    'apps/web/e2e/a.spec.ts',
    'docs/x.md',
  ]);
  const from = 'scripts/ci/x.test.mjs';
  assert.deepEqual(resolveLiteral(from, './helper', tracked), {
    kind: 'file',
    path: 'scripts/ci/helper.mjs',
  });
  assert.deepEqual(resolveLiteral(from, '../lib/util.mjs', tracked), {
    kind: 'file',
    path: 'scripts/lib/util.mjs',
  });
  assert.deepEqual(resolveLiteral(from, '.github/workflows/ci.yml', tracked), {
    kind: 'file',
    path: '.github/workflows/ci.yml',
  });
  assert.deepEqual(resolveLiteral(from, '.github/workflows', tracked), {
    kind: 'dir',
    path: '.github/workflows/',
  });
  assert.deepEqual(resolveLiteral(from, 'apps/web/e2e/', tracked), {
    kind: 'dir',
    path: 'apps/web/e2e/',
  });
  // Area roots, single-segment directories, escapes, absolute paths and prose resolve to nothing.
  for (const text of ['scripts/ci', 'apps/web', 'docs', '../../../x', '/etc/hosts', 'a b', '']) {
    assert.equal(resolveLiteral(from, text, tracked), null, text);
  }
  // Suffixes apply to relative imports only.
  assert.equal(resolveLiteral(from, 'scripts/ci/helper', tracked), null);
});

test('the closure follows scripts, keeps template parts and marks scanners', () => {
  const files = {
    'scripts/ci/a.test.mjs':
      "import { x } from './lib.mjs';\nconst p = `${root}/apps/web/playwright.config.ts`;\n",
    'scripts/ci/lib.mjs': "export const x = 'packages/database/src/schema';\n",
    'scripts/ci/scan.test.mjs': "fs.readdirSync('.github/workflows');\n",
  };
  const extra = ['apps/web/playwright.config.ts', 'packages/database/src/schema/a.ts'];
  const closure = closureFor(files, 'scripts/ci/a.test.mjs', extra);
  assert.deepEqual(
    [...closure.files].sort(byText),
    ['apps/web/playwright.config.ts', 'scripts/ci/a.test.mjs', 'scripts/ci/lib.mjs'].sort(byText)
  );
  assert.deepEqual([...closure.dirs], ['packages/database/src/schema/']);
  assert.equal(closure.scanner, false);
  const schemaFile = 'packages/database/src/schema/a.ts';
  assert.equal(touches(closure, [schemaFile]), schemaFile);

  const scan = closureFor(files, 'scripts/ci/scan.test.mjs', ['.github/workflows/ci.yml']);
  assert.equal(scan.scanner, true);
  // A scanner matches file inputs only; its directory reads belong to the area table.
  assert.equal(touches(scan, ['.github/workflows/ci.yml']), undefined);
  assert.equal(touches(scan, ['scripts/ci/scan.test.mjs']), 'scripts/ci/scan.test.mjs');
});

test('a deleted input still selects the unchanged test that reads it', () => {
  const config = 'apps/web/playwright.config.ts';
  const files = { 'scripts/ci/a.test.mjs': `read('${config}');\n` };
  // The input exists only at the merge-base: HEAD deleted it, so `read` returns nothing for it.
  const closure = closureFor(files, 'scripts/ci/a.test.mjs', [config]);
  assert.equal(touches(closure, [config]), config);
});

test('command wiring follows pnpm links and refuses anything else', () => {
  const scripts = {
    top: 'pnpm a && pnpm run b',
    a: 'node scripts/a.mjs',
    b: 'node scripts/b.mjs && pnpm c',
    c: 'node scripts/c.mjs --flag',
    odd: 'pnpm a && tsx scripts/d.ts',
    loop: 'pnpm loop2',
    loop2: 'pnpm loop',
  };
  const seen = new Set();
  assert.deepEqual(commandScripts(scripts, 'top', seen), [
    'scripts/a.mjs',
    'scripts/b.mjs',
    'scripts/c.mjs',
  ]);
  assert.deepEqual([...seen].sort(byText), ['a', 'b', 'c', 'top']);
  assert.equal(commandScripts(scripts, 'odd'), null);
  assert.equal(commandScripts(scripts, 'loop'), null);
  assert.equal(commandScripts(scripts, 'missing'), null);
});

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
  for (const file of FULL_FALLBACK) assert.match(select([file]).full, /changed$/u);
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

function gitRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-affected-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'init');
  return dir;
}

test('main refuses bad usage, an unknown base and a dirty tree before running anything', async t => {
  const errors = [];
  t.mock.method(console, 'error', text => errors.push(text));
  assert.equal(await main(['--fast']), 2);
  assert.equal(await main(['--base', 'main', 'extra']), 2);
  const dir = gitRepo(t);
  assert.equal(await main(['--base', 'no-such-ref'], dir), 2);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  assert.equal(await main(['--base', 'main'], dir), 2);
  assert.match(errors.at(-1), /working tree is not clean\. Nothing ran\./u);
});
