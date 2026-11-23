import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadDependencies, main, planWork } from './contract-test-affected.mjs';
import {
  GUARD_TRUST_SHARDS,
  RETIRED_LEGACY_FILES,
  RETIRED_LEGACY_TESTS,
} from './contract-test-shards.mjs';

const passing = "import test from 'node:test';\ntest('ok', () => {});\n";
const failing = "import test from 'node:test';\ntest('broken', () => { throw new Error('x'); });\n";
// Stub hosted commands and guard: each records its name (the guard also its base) and fails when
// the test names it in FIXTURE_FAIL.
const stub = [
  "import fs from 'node:fs';",
  'const name = process.argv[2];',
  'const base = process.env.MODULARITY_GUARD_BASE_SHA ?? "";',
  'fs.appendFileSync(process.env.FIXTURE_LOG, `${name} ${name === "guard" ? base : ""}\\n`);',
  'process.exit(process.env.FIXTURE_FAIL === name ? 1 : 0);',
  '',
].join('\n');
const manifest = {
  name: 'fixture',
  private: true,
  scripts: {
    'test:ci:contracts:parallel': 'node scripts/stub.mjs contracts',
    'check:e2e-contracts': 'node scripts/stub.mjs e2e',
  },
};
const retiredBody = file =>
  [
    "import test from 'node:test';",
    "test('still active', () => {});",
    ...RETIRED_LEGACY_TESTS[file].map(name => `test(${JSON.stringify(name)}, () => {});`),
    '',
  ].join('\n');

// A valid contract suite for contractTestPlan, stub hosted commands and a stub guard.
function suite(packageJson) {
  const files = {
    // `pnpm run` in a bare package installs: keep its output out of the diff, as a checkout does.
    '.gitignore': 'node_modules/\npnpm-lock.yaml\n',
    'package.json': packageJson,
    'scripts/stub.mjs': stub,
    'scripts/security-guard.mjs': `process.argv[2] = 'guard';\nawait import('./stub.mjs');\n`,
    'scripts/check-modularity-guard.test.mjs': passing,
    'scripts/ci/e2e-lanes.test.mjs': passing,
    'scripts/ci/reader.test.mjs': `${passing}const input = 'docs/input.md';\n`,
    'scripts/ci/contract-test-shards.test.mjs': passing,
    'scripts/ci/helper.mjs': 'export const x = 1;\n',
    'docs/input.md': 'input\n',
    'docs/other.md': 'other\n',
  };
  for (const file of Object.values(GUARD_TRUST_SHARDS).flat()) files[file] = passing;
  for (const file of RETIRED_LEGACY_FILES) files[file] = failing;
  for (const file of Object.keys(RETIRED_LEGACY_TESTS)) files[file] = retiredBody(file);
  return files;
}

// A repository whose main moves on after `topic` forks, so the merge-base is neither tip.
function fixture(t, packageJson = JSON.stringify(manifest), extra = {}) {
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
  write({ ...suite(packageJson), ...extra });
  const base = commit('base');
  git('checkout', '-q', '-b', 'topic');
  git('checkout', '-q', 'main');
  write({ 'docs/main-only.md': 'later\n' });
  const mainTip = commit('main moves on');
  git('checkout', '-q', 'topic');
  return { dir, git, write, commit, base, mainTip };
}

async function run(t, repo, { fail, load } = {}) {
  const log = `${repo.dir}.log`;
  t.after(() => fs.rmSync(log, { force: true }));
  fs.writeFileSync(log, '');
  const saved = { ...process.env };
  Object.assign(process.env, { FIXTURE_LOG: log, FIXTURE_FAIL: fail ?? '' });
  const lines = [];
  t.mock.method(process.stdout, 'write', text => lines.push(String(text)) || true);
  try {
    const code = await main(['--base', 'main'], repo.dir, load);
    return { code, output: lines.join(''), ran: fs.readFileSync(log, 'utf8').trim().split('\n') };
  } finally {
    t.mock.restoreAll();
    process.env = saved;
  }
}

test('an E2E-area diff runs the e2e tests and the E2E command; an E2E failure fails the run', async t => {
  const repo = fixture(t);
  repo.write({ 'apps/web/e2e/a.spec.ts': 'export {};\n' });
  repo.commit('e2e spec');
  const green = await run(t, repo);
  assert.equal(green.code, 0, green.output);
  assert.match(
    green.output,
    /scripts\/ci\/e2e-lanes\.test\.mjs {2}<- apps\/web\/e2e\/a\.spec\.ts/u
  );
  assert.match(green.output, /contract shard core: pass/u);
  assert.deepEqual(green.ran, ['e2e ', `guard ${repo.base}`]);
  const red = await run(t, repo, { fail: 'e2e' });
  assert.equal(red.code, 1, red.output);
  assert.match(red.output, /contract shard core: pass/u);
});

test('the guard gets the merge-base, not a tip, even with nothing selected; its failure counts', async t => {
  const repo = fixture(t);
  repo.write({ 'docs/other.md': 'changed\n' });
  const firstTopic = repo.commit('docs');
  // A second topic commit: HEAD^ is then neither the fork point nor a tip.
  repo.write({ 'docs/other.md': 'changed again\n' });
  repo.commit('docs again');
  assert.notEqual(repo.base, repo.mainTip);
  assert.equal(repo.git('rev-parse', 'HEAD^').trim(), firstTopic);
  assert.notEqual(firstTopic, repo.base);
  const green = await run(t, repo);
  assert.equal(green.code, 0, green.output);
  assert.match(green.output, /0 of \d+ contract test file\(s\) selected/u);
  assert.deepEqual(green.ran, [`guard ${repo.base}`]);
  assert.equal((await run(t, repo, { fail: 'guard' })).code, 1);
});

test('a committed wiring change runs both hosted commands, and either failure fails the run', async t => {
  const repo = fixture(t);
  const rewired = { ...manifest.scripts, 'check:e2e-contracts': 'node scripts/stub.mjs e2e x' };
  repo.write({ 'package.json': JSON.stringify({ ...manifest, scripts: rewired }) });
  repo.commit('rewire the E2E command');
  const green = await run(t, repo);
  assert.equal(green.code, 0, green.output);
  assert.match(green.output, /FULL fallback \(package\.json contract or E2E command wiring/u);
  assert.deepEqual(green.ran, ['contracts ', 'e2e ', `guard ${repo.base}`]);
  for (const fail of ['contracts', 'e2e']) {
    assert.equal((await run(t, repo, { fail })).code, 1, fail);
  }
});

test('an edit to a linked child of the E2E command is a wiring change', async t => {
  const scripts = {
    ...manifest.scripts,
    'check:e2e-contracts': 'pnpm e2e:base',
    'e2e:base': 'node scripts/stub.mjs e2e',
  };
  const repo = fixture(t, JSON.stringify({ ...manifest, scripts }));
  const rewired = { ...scripts, 'e2e:base': 'node scripts/stub.mjs e2e x' };
  repo.write({ 'package.json': JSON.stringify({ ...manifest, scripts: rewired }) });
  repo.commit('rewire only the linked child');
  const result = await run(t, repo);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /FULL fallback \(package\.json contract or E2E command wiring/u);
  assert.deepEqual(result.ran, ['contracts ', 'e2e ', `guard ${repo.base}`]);
});

test('an edit inside a directory the E2E command names runs the E2E command', async t => {
  for (const [argument, edited] of [
    ['fixtures/lanes', 'fixtures/lanes/case.json'],
    ['./fixtures/lanes/', 'fixtures/lanes/case.json'],
    ['.', 'docs/other.md'],
  ]) {
    const scripts = {
      ...manifest.scripts,
      'check:e2e-contracts': `node scripts/stub.mjs e2e ${argument}`,
    };
    const extra = { 'fixtures/lanes/case.json': '{}\n' };
    const repo = fixture(t, JSON.stringify({ ...manifest, scripts }), extra);
    repo.write({ [edited]: '{"changed":true}\n' });
    repo.commit('edit inside the directory argument');
    const result = await run(t, repo);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(result.ran, ['e2e ', `guard ${repo.base}`], argument);
  }
});

test('a runner that cannot load still runs both hosted commands and the guard', async t => {
  const repo = fixture(t);
  repo.write({ 'docs/other.md': 'changed\n' });
  repo.commit('docs');
  const load = () => Promise.resolve({ error: new Error('moved') });
  const result = await run(t, repo, { load });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /FULL fallback \(runner unavailable: moved\)/u);
  assert.deepEqual(result.ran, ['contracts ', 'e2e ', `guard ${repo.base}`]);
  // A module that imports but lacks a required export takes the same fallback: the diff parser,
  // and the selector's own inputs and wiring modules.
  for (const [moduleName, exported] of [
    ['modularity-guard', 'parseNameStatus'],
    ['contract-test-inputs', 'touches'],
    ['contract-test-wiring', 'workspacePackages'],
  ]) {
    const renamed = () =>
      loadDependencies(specifier =>
        import(specifier).then(module =>
          specifier.includes(moduleName) ? { ...module, [exported]: undefined } : module
        )
      );
    const missing = await run(t, repo, { load: renamed });
    assert.equal(missing.code, 0, missing.output);
    assert.match(
      missing.output,
      new RegExp(`runner unavailable: missing export\\(s\\) ${exported}`, 'u')
    );
    assert.match(missing.output, /unknown changed path/u);
    assert.deepEqual(missing.ran, ['contracts ', 'e2e ', `guard ${repo.base}`], moduleName);
  }
});

test('planWork: deleted inputs, renames into tests, fallback order and unreadable manifests', async t => {
  const repo = fixture(t);
  repo.git('rm', '-q', 'docs/input.md');
  repo.git('mv', 'scripts/ci/helper.mjs', 'scripts/ci/renamed.test.mjs');
  repo.commit('delete an input and rename a helper into a test');
  const work = await planWork(repo.dir, 'main');
  assert.equal(work.full, null);
  assert.equal(work.selected.get('scripts/ci/reader.test.mjs'), 'docs/input.md');
  const runnerTest = 'scripts/ci/contract-test-shards.test.mjs';
  assert.equal(work.selected.get(runnerTest), 'scripts/ci/renamed.test.mjs (test set)');
  repo.git('rm', '-q', Object.values(GUARD_TRUST_SHARDS).flat()[0]);
  repo.commit('remove a pinned guard test');
  assert.match(
    (await planWork(repo.dir, 'main')).full,
    /^contract test plan refused: guard-trust/u
  );
  repo.write({ 'pnpm-workspace.yaml': 'packages: []\n' });
  repo.commit('workspace');
  assert.equal((await planWork(repo.dir, 'main')).full, 'pnpm-workspace.yaml changed');
  const broken = fixture(t, '{ not json');
  broken.write({ 'package.json': JSON.stringify(manifest) });
  broken.commit('repair the manifest');
  assert.match(
    (await planWork(broken.dir, 'main')).full,
    /package\.json is missing or unreadable/u
  );
});

test('planWork fails safe: imported packages pin their workspace dependencies; odd entries run full', async t => {
  const pkg = (name, optionalDependencies = {}) => JSON.stringify({ name, optionalDependencies });
  // The E2E entry imports the package too, and the dependency is an aliased optional one.
  const scripts = { ...manifest.scripts, 'check:e2e-contracts': 'node scripts/e2e-entry.mjs' };
  const repo = fixture(t, JSON.stringify({ ...manifest, scripts }), {
    'scripts/e2e-entry.mjs': "export const load = () => import('@interdomestik/db');\n",
    'packages/db/package.json': pkg('@interdomestik/db', {
      utilsAlias: 'workspace:../utils',
    }),
    'packages/utils/package.json': pkg('@interdomestik/utils'),
    'packages/utils/src/b.ts': 'export {};\n',
    'scripts/ci/pkg.test.mjs': `${passing}export const load = () => import('@interdomestik/db');\n`,
  });
  repo.write({ 'packages/utils/src/b.ts': 'export const b = 1;\n' });
  repo.commit('edit a dependency of an imported package');
  const work = await planWork(repo.dir, 'main');
  assert.equal(work.full, null);
  assert.equal(work.selected.get('scripts/ci/pkg.test.mjs'), 'packages/utils/src/b.ts');
  assert.equal(work.e2e, 'packages/utils/src/b.ts');
  const entry = { file: 'docs/other.md', oldPath: null, status: 'X' };
  const odd = () =>
    loadDependencies().then(found => ({ ...found, parseNameStatus: () => [entry] }));
  assert.equal(
    (await planWork(repo.dir, 'main', odd)).full,
    'unrecognized diff entry X docs/other.md'
  );
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
