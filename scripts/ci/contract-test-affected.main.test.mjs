import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { main, planWork } from './contract-test-affected.mjs';
import {
  GUARD_TRUST_SHARDS,
  RETIRED_LEGACY_FILES,
  RETIRED_LEGACY_TESTS,
} from './contract-test-shards.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const passing = "import test from 'node:test';\ntest('ok', () => {});\n";
const failing = "import test from 'node:test';\ntest('broken', () => { throw new Error('x'); });\n";
const exiting = code => `process.exit(${code});\n`;
// The stub guard records the base it was given, then exits as the test asks.
const guard = [
  "import fs from 'node:fs';",
  'fs.writeFileSync(process.env.FIXTURE_GUARD_OUT, process.env.MODULARITY_GUARD_BASE_SHA ?? "");',
  'process.exit(Number(process.env.FIXTURE_GUARD_EXIT ?? 0));',
  '',
].join('\n');
const retiredBody = file =>
  [
    "import test from 'node:test';",
    "test('still active', () => {});",
    ...RETIRED_LEGACY_TESTS[file].map(name => `test(${JSON.stringify(name)}, () => {});`),
    '',
  ].join('\n');

// A valid contract suite for contractTestPlan, the real runner, a stub E2E command and guard.
function suite() {
  const files = {
    // `pnpm run` in a bare package installs: keep its output out of the diff, as a checkout does.
    '.gitignore': 'node_modules/\npnpm-lock.yaml\n',
    'package.json': JSON.stringify({
      name: 'fixture',
      private: true,
      scripts: {
        'test:ci:contracts:parallel': 'node scripts/ci/contract-test-shards.mjs parallel',
        'check:e2e-contracts': 'node scripts/e2e-check.mjs',
      },
    }),
    'scripts/e2e-check.mjs': exiting(0),
    'scripts/security-guard.mjs': guard,
    'scripts/check-modularity-guard.test.mjs': passing,
    'scripts/ci/e2e-lanes.test.mjs': `${passing}// reads apps/web/e2e/\n`,
    'scripts/ci/reader.test.mjs': `${passing}const input = 'docs/input.md';\n`,
    'scripts/ci/contract-test-shards.test.mjs': passing,
    'scripts/ci/helper.mjs': 'export const x = 1;\n',
    'docs/input.md': 'input\n',
    'docs/other.md': 'other\n',
  };
  for (const file of Object.values(GUARD_TRUST_SHARDS).flat()) files[file] = passing;
  for (const file of RETIRED_LEGACY_FILES) files[file] = failing;
  for (const file of Object.keys(RETIRED_LEGACY_TESTS)) files[file] = retiredBody(file);
  for (const file of ['contract-test-shards.mjs', 'contract-test-scratch.mjs']) {
    files[`scripts/ci/${file}`] = fs.readFileSync(path.join(root, 'scripts/ci', file), 'utf8');
  }
  return files;
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-affected-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('/usr/bin/git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  const write = files => {
    for (const [file, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), body);
    }
  };
  const commit = message => {
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', message);
    return git('rev-parse', 'HEAD').trim();
  };
  git('init', '-q', '-b', 'main');
  write(suite());
  const base = commit('base');
  git('checkout', '-q', '-b', 'topic');
  return { dir, git, write, commit, base };
}

async function run(t, repo, env = {}) {
  const out = path.join(repo.dir, '..', `${path.basename(repo.dir)}-guard.txt`);
  t.after(() => fs.rmSync(out, { force: true }));
  const saved = { ...process.env };
  Object.assign(process.env, { FIXTURE_GUARD_OUT: out, ...env });
  const lines = [];
  t.mock.method(process.stdout, 'write', text => lines.push(String(text)) || true);
  t.mock.method(console, 'error', text => lines.push(String(text)));
  try {
    const code = await main(['--base', 'main'], repo.dir);
    return { code, output: lines.join(''), guardBase: fs.readFileSync(out, 'utf8') };
  } finally {
    t.mock.restoreAll();
    process.env = saved;
  }
}

test('an E2E-area diff runs the e2e tests and the E2E command, and its failure fails the run', async t => {
  const repo = fixture(t);
  repo.write({ 'apps/web/e2e/a.spec.ts': 'export {};\n' });
  repo.commit('e2e spec');
  const green = await run(t, repo);
  assert.equal(green.code, 0, green.output);
  assert.match(
    green.output,
    /scripts\/ci\/e2e-lanes\.test\.mjs {2}<- apps\/web\/e2e\/a\.spec\.ts/u
  );
  assert.match(green.output, /check:e2e-contracts: selected/u);
  assert.equal(green.guardBase, repo.base);
  repo.write({ 'scripts/e2e-check.mjs': exiting(1) });
  repo.commit('break the E2E command');
  const red = await run(t, repo);
  assert.equal(red.code, 1, red.output);
  assert.match(red.output, /contract shard core: pass/u);
  assert.match(red.output, /FAIL: /u);
});

test('the guard runs against the merge-base even with nothing selected, and its failure counts', async t => {
  const repo = fixture(t);
  repo.write({ 'docs/other.md': 'changed\n' });
  repo.commit('docs');
  const result = await run(t, repo, { FIXTURE_GUARD_EXIT: '1' });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /0 of \d+ contract test file\(s\) selected/u);
  assert.equal(result.guardBase, repo.base);
});

test('planWork selects consumers of deleted inputs and the runner test for a rename into tests', t => {
  const repo = fixture(t);
  repo.git('rm', '-q', 'docs/input.md');
  repo.git('mv', 'scripts/ci/helper.mjs', 'scripts/ci/renamed.test.mjs');
  repo.commit('delete an input and rename a helper into a test');
  const work = planWork(repo.dir, 'main');
  assert.equal(work.full, null);
  assert.equal(work.selected.get('scripts/ci/reader.test.mjs'), 'docs/input.md');
  assert.equal(
    work.selected.get('scripts/ci/contract-test-shards.test.mjs'),
    'scripts/ci/renamed.test.mjs (test set)'
  );
});

test('known fallback wins over a broken plan, and a broken plan falls back too', t => {
  const repo = fixture(t);
  const guardTest = Object.values(GUARD_TRUST_SHARDS).flat()[0];
  repo.git('rm', '-q', guardTest);
  repo.commit('remove a pinned guard test');
  assert.match(planWork(repo.dir, 'main').full, /^contract test plan refused: guard-trust/u);
  repo.write({ 'pnpm-workspace.yaml': 'packages: []\n' });
  repo.commit('workspace');
  assert.equal(planWork(repo.dir, 'main').full, 'pnpm-workspace.yaml changed');
  repo.write({ 'package.json': repo.git('show', 'main:package.json').replace('e2e-check', 'x') });
  assert.throws(() => planWork(repo.dir, 'main'), /working tree is not clean/u);
});

test('main refuses bad arguments, a non-commit base and an untracked file, and runs nothing', async t => {
  const repo = fixture(t);
  const errors = [];
  t.mock.method(console, 'error', text => errors.push(String(text)));
  for (const argv of [['--base'], ['--base', '--independent'], ['--fast']]) {
    assert.equal(await main(argv, repo.dir), 2, argv.join(' '));
  }
  assert.match(errors.at(-1), /usage: .*Nothing ran\./u);
  assert.equal(await main(['--base', 'no-such-ref'], repo.dir), 2);
  assert.match(errors.at(-1), /base no-such-ref is not a commit\. Nothing ran\./u);
  repo.git('config', 'status.showUntrackedFiles', 'no');
  repo.write({ 'scripts/ci/untracked.test.mjs': passing });
  assert.equal(await main(['--base', 'main'], repo.dir), 2);
  assert.match(errors.at(-1), /working tree is not clean\. Nothing ran\./u);
});
