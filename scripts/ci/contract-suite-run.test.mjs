import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  GUARD_TRUST_SHARDS,
  RETIRED_LEGACY_FILES,
  RETIRED_LEGACY_TESTS,
  contractTestPlan,
} from './contract-test-shards.mjs';

const entry = 'scripts/ci/contract-suite-run.mjs';
const retained = 'scripts/ci/retained.test.mjs';
const skipped = GUARD_TRUST_SHARDS.candidate[0];
const extra = 'scripts/check-modularity-guard.test.mjs';
const shards = ['core', ...Object.keys(GUARD_TRUST_SHARDS)];
const passing = "import test from 'node:test';\ntest('passes', () => {});\n";
const failing =
  "import test from 'node:test';\ntest('fixture fails', () => { throw new Error('fixture failure'); });\n";

function fixture(t, { tests = {}, toolingOnly = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, body) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };
  for (const name of [
    'contract-suite-run.mjs',
    'contract-suite-surface.mjs',
    'contract-test-shards.mjs',
    'contract-test-scratch.mjs',
  ]) {
    write(`scripts/ci/${name}`, fs.readFileSync(new URL(name, import.meta.url)));
  }
  for (const file of [retained, extra, ...Object.values(GUARD_TRUST_SHARDS).flat()]) {
    const retiredNames = RETIRED_LEGACY_TESTS[file] ?? [];
    const retired = retiredNames.map(
      name => `test(${JSON.stringify(name)}, () => { throw new Error('retired test ran'); });\n`
    );
    write(file, (tests[file] ?? passing) + retired.join(''));
  }
  for (const file of RETIRED_LEGACY_FILES) write(file, failing);
  const files =
    toolingOnly === 'all' ? Object.values(contractTestPlan(root).shards).flat() : toolingOnly;
  write(
    'scripts/ci/contract-tooling-only.json',
    JSON.stringify({ derivedOn: 'fixture', evidence: 'fixture', files })
  );

  const env = { ...process.env, EVENT_NAME: 'push', GITHUB_ACTIONS: 'false' };
  delete env.NODE_TEST_CONTEXT;
  const git = (...args) =>
    execFileSync(
      '/usr/bin/git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      {
        cwd: root,
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      }
    ).trim();

  function pullRequest(file = 'apps/a') {
    git('init', '--quiet', '--template=');
    for (const dir of ['apps', 'packages', 'docs', 'tools']) write(`${dir}/a`, 'base\n');
    git('add', 'apps', 'packages', 'docs', 'tools');
    const base = git('commit-tree', git('write-tree'), '-m', 'base');
    write(file, 'PR change\n');
    git('add', '--', file);
    const tree = git('write-tree');
    const head = git('commit-tree', tree, '-m', 'PR head', '-p', base);
    const merge = git('commit-tree', tree, '-m', 'merge', '-p', base, '-p', head);
    git('update-ref', 'HEAD', merge);
    Object.assign(env, {
      EVENT_NAME: 'pull_request',
      BASE_SHA: base,
      HEAD_SHA: head,
      PR_DRAFT: 'false',
    });
  }

  function run(args = [entry]) {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return { status: result.status, output: result.stdout + result.stderr };
  }
  return { root, env, pullRequest, run };
}

test('a push or tooling PR reaches every full shard through the audit entry point', t => {
  const suite = fixture(t, { toolingOnly: 'all' });
  for (const reason of ['non-pull-request', 'path-outside-product-roots']) {
    if (reason === 'path-outside-product-roots') suite.pullRequest('tools/a');
    const { status, output } = suite.run();
    assert.equal(status, 0, output);
    assert.ok(output.includes(`contract lane: full (${reason})`), output);
    for (const shard of shards) {
      assert.match(output, new RegExp(`contract shard ${shard}: [1-9]\\d* selected file`, 'u'));
      assert.ok(output.includes(`contract shard ${shard}: pass;`), output);
    }
  }
});

test('product skips only listed files and reports empty shards without starting them', t => {
  const suite = fixture(t, { tests: { [skipped]: failing }, toolingOnly: [skipped] });
  suite.pullRequest();
  const { status, output } = suite.run();
  assert.equal(status, 0, output);
  assert.match(output, /contract lane: product \(product-paths-only\)/u);
  assert.match(output, /contract shard candidate: 0 selected file\(s\)/u);
  assert.doesNotMatch(output, /contract shard candidate: (pass|FAIL)/u);
  assert.match(output, /contract shard core: pass; 2 file\(s\)/u);
});

test('a failing retained file makes the product entry point exit 1', t => {
  const suite = fixture(t, { tests: { [retained]: failing } });
  suite.pullRequest();
  const { status, output } = suite.run();
  assert.equal(status, 1, output);
  assert.match(output, /contract lane: product/u);
  assert.match(output, /fixture failure/u);
  assert.match(output, /contract shard core: FAIL \(code=1/u);
});

test('a selector exception runs the full suite and propagates a shard failure', t => {
  const suite = fixture(t, { tests: { [skipped]: failing }, toolingOnly: [skipped] });
  const { status, output } = suite.run([
    '--input-type=module',
    '--eval',
    `
    import { runContractSuite } from './${entry}';
    process.exitCode = await runContractSuite(() => { throw new Error('selector fixture threw'); });
  `,
  ]);
  assert.equal(status, 1, output);
  assert.match(output, /contract lane: full \(selector-error\)/u);
  assert.match(output, /contract shard candidate: FAIL \(code=1/u);
  for (const shard of shards.filter(name => name !== 'candidate')) {
    assert.ok(output.includes(`contract shard ${shard}: pass;`), output);
  }
});

test('an unknown lane runs and reports the full suite', t => {
  const suite = fixture(t, { tests: { [skipped]: failing }, toolingOnly: [skipped] });
  const { status, output } = suite.run([
    '--input-type=module',
    '--eval',
    `
    import { runContractSuite } from './${entry}';
    process.exitCode = await runContractSuite(() => ({ lane: 'partial', reason: 'fixture' }));
  `,
  ]);
  assert.equal(status, 1, output);
  assert.match(output, /contract lane: full \(unknown-lane\)/u);
  assert.doesNotMatch(output, /contract lane: partial/u);
  assert.match(output, /contract shard candidate: FAIL \(code=1/u);
});

test('zero selected product files fails before starting any shard', t => {
  const suite = fixture(t, { toolingOnly: 'all' });
  suite.pullRequest();
  const { status, output } = suite.run();
  assert.equal(status, 1, output);
  assert.match(output, /contract lane: product/u);
  for (const shard of shards) {
    assert.ok(output.includes(`contract shard ${shard}: 0 selected file(s)`), output);
  }
  assert.match(output, /product lane selected no test files/u);
  assert.doesNotMatch(output, /TAP version|--- shard/u);
});

test('an interrupted run exits 1', { timeout: 15_000 }, async t => {
  const { root, env } = fixture(t, {
    tests: {
      [retained]: `import test from 'node:test';
        import { writeFileSync } from 'node:fs';
        test('waits for interruption', async () => {
          writeFileSync('shard-started', '');
          await new Promise(resolve => setTimeout(resolve, 10_000));
        });`,
    },
  });
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const closed = once(child, 'close');
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8').on('data', chunk => {
      output += chunk;
    });
  }
  const started = path.join(root, 'shard-started');
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(started) && child.exitCode === null && Date.now() < deadline)
    await delay(20);
  assert.ok(fs.existsSync(started), output);
  assert.ok(child.kill('SIGTERM'));
  assert.deepEqual(await closed, [1, null], output);
  assert.match(output, /contract shard core: FAIL/u);
});
