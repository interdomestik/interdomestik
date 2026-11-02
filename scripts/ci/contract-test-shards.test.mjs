import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

import {
  GUARD_TRUST_SHARDS,
  contractTestPlan,
  listContractTestFiles,
  runParallel,
} from './contract-test-shards.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const FULL_GLOB = 'scripts/ci/*.test.mjs scripts/check-modularity-guard.test.mjs';
const GUARD_TRUST_FILES = [
  'scripts/ci/db-access-required-authority.test.mjs',
  'scripts/ci/db-access-required-candidate.test.mjs',
  'scripts/ci/db-access-required-merge.test.mjs',
  'scripts/ci/db-access-guard.test.mjs',
  'scripts/ci/db-access-git.test.mjs',
];

// Independent of the helper: what the shell expands for the full serialized script.
const shellGlobFiles = repoRoot =>
  [
    ...fs
      .readdirSync(path.join(repoRoot, 'scripts/ci'))
      .filter(name => /^[^.].*\.test\.mjs$/u.test(name))
      .map(name => `scripts/ci/${name}`),
    'scripts/check-modularity-guard.test.mjs',
  ].sort();

function fixtureRoot(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-shards-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  }
  return dir;
}

const passing = "import test from 'node:test';\ntest('ok', () => {});\n";
const failing = "import test from 'node:test';\ntest('broken', () => { throw new Error('x'); });\n";
const minimalSuite = (overrides = {}) =>
  Object.fromEntries(
    [...GUARD_TRUST_FILES, 'scripts/ci/core-a.test.mjs', 'scripts/check-modularity-guard.test.mjs']
      .map(file => [file, passing])
      .concat(Object.entries(overrides))
  );

test('full serialized contract script keeps the complete glob for local and Z620 parity', () => {
  assert.equal(scripts['test:ci:contracts'], `node --test --test-concurrency=1 ${FULL_GLOB}`);
  assert.equal(scripts['test:ci:contracts:core'], 'node scripts/ci/contract-test-shards.mjs core');
  assert.equal(
    scripts['test:ci:contracts:guard-trust'],
    'node scripts/ci/contract-test-shards.mjs guard-trust'
  );
  assert.equal(
    scripts['test:ci:contracts:parallel'],
    'node scripts/ci/contract-test-shards.mjs parallel'
  );
});

test('guard-trust shards are pinned by exact name and are the only exclusions from core', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(GUARD_TRUST_SHARDS)), {
    authority: [GUARD_TRUST_FILES[0]],
    candidate: [GUARD_TRUST_FILES[1]],
    'merge-guard-git': GUARD_TRUST_FILES.slice(2),
  });
  const { all, shards } = contractTestPlan(root);
  assert.deepEqual(
    all.filter(file => !shards.core.includes(file)),
    [...GUARD_TRUST_FILES].sort()
  );
});

test('core plus guard-trust shards equal the full glob with no overlap and no drop', () => {
  const expected = shellGlobFiles(root);
  assert.ok(expected.length > GUARD_TRUST_FILES.length);
  assert.deepEqual(listContractTestFiles(root), expected);
  const assigned = Object.values(contractTestPlan(root).shards).flat();
  assert.equal(new Set(assigned).size, assigned.length, 'a file is assigned to two shards');
  assert.deepEqual([...assigned].sort(), expected);
  assert.ok(assigned.includes('scripts/ci/contract-test-shards.test.mjs'));
});

test('a contract test added later lands in core by default', t => {
  const dir = fixtureRoot(t, minimalSuite({ 'scripts/ci/added-later.test.mjs': passing }));
  const { shards } = contractTestPlan(dir);
  assert.deepEqual(shards.core, [
    'scripts/check-modularity-guard.test.mjs',
    'scripts/ci/added-later.test.mjs',
    'scripts/ci/core-a.test.mjs',
  ]);
});

test('a renamed or deleted guard-trust file fails closed instead of silently shrinking', t => {
  const suite = minimalSuite();
  delete suite['scripts/ci/db-access-git.test.mjs'];
  const dir = fixtureRoot(t, suite);
  assert.throws(() => contractTestPlan(dir), /guard-trust contract files missing/u);
});

test('parallel run passes only when every shard passes, without fail-fast', async t => {
  const output = [];
  const write = text => output.push(text);
  assert.equal(await runParallel({ root: fixtureRoot(t, minimalSuite()), write }), 0);
  for (const shard of ['core', 'authority', 'candidate', 'merge-guard-git']) {
    assert.match(output.join(''), new RegExp(`contract shard ${shard}: pass`, 'u'));
  }
  output.length = 0;
  const broken = minimalSuite({ [GUARD_TRUST_FILES[1]]: failing });
  assert.equal(await runParallel({ root: fixtureRoot(t, broken), write }), 1);
  const text = output.join('');
  assert.match(text, /contract shard candidate: FAIL \(code=1/u);
  for (const shard of ['core', 'authority', 'merge-guard-git']) {
    assert.match(text, new RegExp(`contract shard ${shard}: pass`, 'u'));
  }
});

test('required audit context runs every contract shard inside Run Audits', () => {
  const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  const step = workflow.jobs.audit.steps.find(item => item?.name === 'Run Audits');
  assert.equal(step.if, "needs.validation-surface.outputs.run_broad == 'true'");
  const commands = step.run.split('\n').map(line => line.trim());
  assert.equal(commands.filter(line => line === 'pnpm test:ci:contracts:parallel').length, 1);
  assert.equal(commands.filter(line => /^pnpm test:ci:contracts\b/u.test(line)).length, 1);
  assert.ok(!('continue-on-error' in step));
  assert.equal(workflow.jobs.audit.if, undefined, 'audit must never be skipped by a shard');
});
