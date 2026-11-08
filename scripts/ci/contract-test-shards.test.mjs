import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

import {
  GUARD_TRUST_SHARDS,
  RETIRED_LEGACY_FILES,
  RETIRED_LEGACY_TESTS,
  contractTestPlan,
  listContractTestFiles,
  main,
  runParallel,
} from './contract-test-shards.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const GUARD_TRUST_FILES = [
  'scripts/ci/db-access-required-authority.test.mjs',
  'scripts/ci/db-access-required-candidate.test.mjs',
  'scripts/ci/db-access-required-merge.test.mjs',
  'scripts/ci/db-access-guard.test.mjs',
  'scripts/ci/db-access-git.test.mjs',
  'scripts/ci/tenant-guard-s2-workflow.isolation.test.mjs',
  'scripts/ci/tenant-guard-s2-workflow.test.mjs',
];
const RETIRED_FILES = [
  'scripts/ci/db-access-protected-bootstrap.test.mjs',
  'scripts/ci/db-access-protected-route.test.mjs',
  'scripts/ci/db-access-resolver-transition-ci.test.mjs',
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
// A legacy file keeping its active tests next to a retired one that would fail if it ran.
const withRetired = (file, body) =>
  Object.hasOwn(RETIRED_LEGACY_TESTS, file)
    ? [
        "import test from 'node:test';",
        "test('still active', () => {});",
        ...RETIRED_LEGACY_TESTS[file].map(
          name =>
            `test(\n  ${JSON.stringify(name)},\n  () => { throw new Error('retired ran'); }\n);`
        ),
        '',
      ].join('\n')
    : body;
const minimalSuite = (overrides = {}) =>
  Object.fromEntries(
    [
      ...GUARD_TRUST_FILES,
      ...RETIRED_FILES,
      'scripts/ci/core-a.test.mjs',
      'scripts/check-modularity-guard.test.mjs',
    ]
      .map(file => [file, RETIRED_FILES.includes(file) ? failing : withRetired(file, passing)])
      .concat(Object.entries(overrides))
  );

test('full serialized contract script runs every active file for local and Z620 parity', () => {
  assert.equal(scripts['test:z620-runner'], 'node scripts/ci/contract-test-shards.mjs z620');
  assert.equal(scripts['test:ci:contracts'], 'node scripts/ci/contract-test-shards.mjs all');
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
    'merge-guard-git': GUARD_TRUST_FILES.slice(2, 5),
    's2-workflow': GUARD_TRUST_FILES.slice(5),
  });
  const { all, shards } = contractTestPlan(root);
  assert.deepEqual(
    all.filter(file => !shards.core.includes(file)),
    [...GUARD_TRUST_FILES, ...RETIRED_FILES].sort()
  );
});

test('legacy retirement is pinned by exact file and exact test name', () => {
  assert.deepEqual([...RETIRED_LEGACY_FILES], RETIRED_FILES);
  assert.deepEqual(JSON.parse(JSON.stringify(RETIRED_LEGACY_TESTS)), {
    'scripts/ci/db-access-guard.test.mjs': [
      'actual production CLI authenticates root epoch and preserves 604 original entries',
      'existing guard remains selected by mandatory lanes and baseline bytes stay historical',
    ],
    'scripts/ci/db-access-git.test.mjs': [
      'candidate-local hostile PATH never executes during real fixtures, trust or production CLI',
    ],
  });
  const { retired, skipArgs } = contractTestPlan(root);
  assert.deepEqual(retired, RETIRED_FILES);
  assert.deepEqual(
    skipArgs,
    Object.values(RETIRED_LEGACY_TESTS)
      .flat()
      .map(name => `--test-skip-pattern=^${name}$`)
  );
});

test('core plus guard-trust shards equal the full glob minus retired files, with no overlap', () => {
  const expected = shellGlobFiles(root);
  assert.ok(expected.length > GUARD_TRUST_FILES.length);
  assert.deepEqual(listContractTestFiles(root), expected);
  const assigned = Object.values(contractTestPlan(root).shards).flat();
  assert.equal(new Set(assigned).size, assigned.length, 'a file is assigned to two shards');
  assert.deepEqual(
    [...assigned].sort(),
    expected.filter(file => !RETIRED_FILES.includes(file))
  );
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

test('a missing, renamed or ambiguous retirement fails closed instead of widening', t => {
  const withoutFile = minimalSuite();
  delete withoutFile[RETIRED_FILES[0]];
  assert.throws(
    () => contractTestPlan(fixtureRoot(t, withoutFile)),
    /retired legacy files missing/u
  );
  const renamed = minimalSuite({ 'scripts/ci/db-access-guard.test.mjs': passing });
  assert.throws(
    () => contractTestPlan(fixtureRoot(t, renamed)),
    /retired legacy test is not declared exactly once in scripts\/ci\/db-access-guard/u
  );
  const [name] = RETIRED_LEGACY_TESTS['scripts/ci/db-access-git.test.mjs'];
  const elsewhere = minimalSuite({
    'scripts/ci/core-a.test.mjs': `import test from 'node:test';\ntest(${JSON.stringify(name)}, () => {});\n`,
  });
  assert.throws(
    () => contractTestPlan(fixtureRoot(t, elsewhere)),
    /retired legacy test is not declared exactly once/u
  );
});

test('the serialized lane runs every active file and none of the retired assertions', async t => {
  const dir = fixtureRoot(t, minimalSuite());
  assert.equal(await main(['all'], dir, { capture: true }), 0);
  const broken = fixtureRoot(t, minimalSuite({ 'scripts/ci/core-a.test.mjs': failing }));
  assert.equal(await main(['all'], broken, { capture: true }), 1);
});

test('parallel run passes only when every shard passes, without fail-fast', async t => {
  const output = [];
  const write = text => output.push(text);
  assert.equal(await runParallel({ root: fixtureRoot(t, minimalSuite()), write }), 0);
  for (const shard of ['core', 'authority', 'candidate', 'merge-guard-git', 's2-workflow']) {
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
