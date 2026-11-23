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
} from './contract-test-affected.mjs';
import { rawDiffProblem, readDiff, unrecognizedEntry } from './contract-test-parse.mjs';
import { commandScripts, dependencyNames, e2eWiring } from './contract-test-wiring.mjs';
import { parseNameStatus } from '../lib/modularity-guard.mjs';
import { inputClosure, inventory, touches } from './contract-test-inputs.mjs';
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
    touches,
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
    'scripts/ci/contract-test-wiring.mjs',
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

test('fail safe: a raw diff stream that does not parse runs full, before the parser absorbs it', () => {
  const absorbed = 'M\0\0A\0README.md\0M\0docs/other.md\0';
  assert.match(readDiff(absorbed, parseNameStatus).odd, /^unrecognized diff entry /u);
  const unparsed = () => assert.fail('parsed before validation');
  assert.match(readDiff(absorbed, unparsed).odd, /^unrecognized diff entry /u);
  for (const raw of ['X\0a\0', 'R100\0old\0', 'M\0', '\0', 'M\0docs/other.md']) {
    assert.match(rawDiffProblem(raw), /^unrecognized diff entry /u, JSON.stringify(raw));
  }
  const good = 'M\0a\0R100\0old\0new\0C075\0src\0copy\0T\0link\0D\0gone\0A\0new.md\0';
  assert.equal(rawDiffProblem(good), null);
  assert.equal(readDiff(good, parseNameStatus).odd, null);
  assert.equal(rawDiffProblem(''), null);
});

test('fail safe: E2E roots normalize trailing slashes and the root; aliases and optionals count', () => {
  const scripts = { e2e: 'node scripts/a.mjs ./fixtures/lanes/ . dir//' };
  assert.deepEqual(commandScripts(scripts, 'e2e'), ['scripts/a.mjs', 'fixtures/lanes', '.', 'dir']);
  const manifest = {
    dependencies: { plain: '1.0.0', leafAlias: 'workspace:@interdomestik/leaf@*' },
    optionalDependencies: { '@interdomestik/opt': 'workspace:*' },
    peerDependencies: { npmAlias: 'npm:@interdomestik/peer@^1' },
  };
  assert.deepEqual(dependencyNames(manifest).sort(byText), [
    '@interdomestik/leaf',
    '@interdomestik/opt',
    '@interdomestik/peer',
    'leafAlias',
    'npmAlias',
    'plain',
  ]);
  const unresolved = { files: new Set(), dirs: new Set(), unresolved: '@interdomestik/x (e2e)' };
  assert.equal(
    select(['docs/a.md'], { e2eClosure: unresolved }).e2e,
    'unresolved import @interdomestik/x (e2e)'
  );
});

test('final review: root-relative literals, followed helpers, quoted ls-files, .github itself', () => {
  const files = {
    'scripts/ci/a.test.mjs': [
      "readFileSync('./docs/input.md');",
      "run('scripts/check-example');",
      "import { x } from '../../tools/check.mjs';",
    ].join('\n'),
    'scripts/check-example': '#!/bin/sh\ncat docs/example-input.md\n',
    'tools/check.mjs': "export const x = readFileSync('docs/tool-input.md');\n",
    'scripts/ci/b.test.mjs': "run('scripts/help.sh');\n",
    'scripts/help.sh': "help='ls-files'\ntest -d fixtures/lanes\n",
  };
  const inputs = ['docs/input.md', 'docs/example-input.md', 'docs/tool-input.md'];
  const tracked = inventory([
    ...Object.keys(files),
    ...inputs,
    'fixtures/lanes/a.json',
    '.github/dependabot.yml',
  ]);
  const a = inputClosure('scripts/ci/a.test.mjs', file => files[file], tracked);
  for (const input of inputs) assert.ok(a.files.has(input), input);
  const b = inputClosure('scripts/ci/b.test.mjs', file => files[file], tracked);
  assert.equal(b.scanner, false);
  assert.equal(touches(b, ['fixtures/lanes/a.json']), 'fixtures/lanes/a.json');
  const scanning = inputClosure(
    SCAN_TEST,
    () => "readdirSync('.github', { recursive: true });\n",
    tracked
  );
  assert.deepEqual([...scanning.dirs], ['.github/']);
  const work = select(['.github/dependabot.yml'], {
    closureOf: file => (file === SCAN_TEST ? scanning : closures[file]),
  });
  assert.equal(work.selected.get(SCAN_TEST), '.github/dependabot.yml (area .github)');
});

test('final review: linked contracts scripts, flag values, relative aliases, E2E unresolved', () => {
  assert.deepEqual(
    commandScripts({ e2e: 'node scripts/a.mjs --fixtures=./fixtures/lanes/ --quiet' }, 'e2e'),
    ['scripts/a.mjs', 'fixtures/lanes']
  );
  const relative = {
    dependencies: { leafAlias: 'workspace:../leaf' },
    devDependencies: { vendored: 'link:./vendor/x/' },
  };
  assert.deepEqual(dependencyNames(relative, 'packages/db'), [
    'leafAlias',
    'dir:packages/leaf',
    'vendored',
    'dir:packages/db/vendor/x',
  ]);
  const base = {
    'test:ci:contracts:parallel': 'pnpm run contracts:impl',
    'contracts:impl': 'node scripts/c.mjs',
    'check:e2e-contracts': 'node scripts/e2e.mjs',
  };
  const read = file =>
    file === 'scripts/e2e.mjs' ? "await import('@interdomestik/ghost');\n" : undefined;
  const paths = inventory(['scripts/e2e.mjs', 'scripts/c.mjs']);
  paths.workspace = new Map();
  const after = { ...base, 'contracts:impl': 'node scripts/c.mjs --all' };
  const rewired = e2eWiring(null, null, read, paths, { before: base, after });
  assert.match(rewired.full, /wiring changed/u);
  const same = e2eWiring(null, null, read, paths, { before: base, after: base });
  const reason = '@interdomestik/ghost (imported by scripts/e2e.mjs)';
  assert.equal(same.closure.unresolved, reason);
  assert.equal(
    select(['docs/a.md'], { e2eClosure: same.closure }).e2e,
    `unresolved import ${reason}`
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
      touches,
    });
  const e2e = run(['apps/web/e2e/auth.spec.ts']);
  assert.ok(e2e.selected.has('scripts/ci/e2e-tenant-host-lanes.test.mjs'));
  assert.equal(e2e.e2e, 'apps/web/e2e/auth.spec.ts');
  assert.ok(run(['.github/workflows/ci.yml']).selected.has(PLAN_TEST));
});
