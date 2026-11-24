import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const releaseCandidate = yaml.load(
  fs.readFileSync(path.join(root, '.github/workflows/release-candidate.yml'), 'utf8')
);
const findStep = (steps, name) => steps.find(step => step?.name === name);

function assertRlsRun(command) {
  assert.equal(command, 'pnpm db:rls:test');
}

test('CI RLS contract rejects an early successful exit', () => {
  const rls = findStep(workflow.jobs['e2e-gate'].steps, 'RLS Integration Test');
  assert.throws(() => assertRlsRun(`exit 0\n${rls.run}`), { code: 'ERR_ASSERTION' });
});

test('CI audit preserves full E2E, tenant guard, and architecture guards', () => {
  const auditRun = findStep(workflow.jobs.audit.steps, 'Run Audits').run;
  assert.match(auditRun, /pnpm check:e2e-contracts\b/u);
  assert.doesNotMatch(auditRun, /check:e2e-contracts:base/u);
  assert.match(auditRun, /pnpm check:tenant-guard\b/u);
  assert.doesNotMatch(auditRun, /pnpm check:db-access\b/u);
  assert.match(auditRun, /pnpm check:architecture-boundaries/u);
});

test('CI RLS integration requires both integration and coverage guards', () => {
  const rls = findStep(workflow.jobs['e2e-gate'].steps, 'RLS Integration Test');
  assert.equal(rls.env.REQUIRE_RLS_INTEGRATION, '1');
  assert.equal(rls.env.REQUIRE_RLS_COVERAGE, '1');
  const checkout = workflow.jobs['e2e-gate'].steps.find(
    step => step.uses === 'actions/checkout@v5'
  );
  assert.equal(checkout.with['fetch-depth'], 0);
  assertRlsRun(rls.run);
  assert.equal(
    workflow.jobs['e2e-gate'].env.DATABASE_URL,
    'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test'
  );
  const rootScripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const communicationsScripts = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/domain-communications/package.json'), 'utf8')
  ).scripts;
  const billingScripts = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/domain-membership-billing/package.json'), 'utf8')
  ).scripts;
  assert.equal(
    rootScripts['db:rls:test'],
    'pnpm --filter @interdomestik/database test:rls && pnpm --filter @interdomestik/domain-communications test:rls && pnpm --filter @interdomestik/domain-membership-billing test:rls && pnpm db:rls:test:staff-detail'
  );
  assert.equal(rootScripts['db:rls:test:staff-detail'], 'node scripts/run-staff-detail-rls.mjs');
  // Each message suite grants its own role on shared catalog rows, so files run one at a time.
  assert.equal(
    communicationsScripts['test:rls'],
    'MESSAGE_RLS_INTEGRATION=1 REQUIRE_RLS_INTEGRATION=1 vitest run --no-file-parallelism src/messages/tenant-context.integration.test.ts src/messages/send-negative-matrix.integration.test.ts src/messages/send-idempotency.integration.test.ts src/messages/public-reply-notification.integration.test.ts'
  );
  assert.equal(
    billingScripts['test:rls'],
    'BILLING_RLS_INTEGRATION=1 REQUIRE_RLS_INTEGRATION=1 vitest run --no-file-parallelism src/port/individual-sales.rls.test.ts src/port/individual-sale-age-boundary.rls.test.ts src/port/individual-sale-weekly-rate.rls.test.ts && REQUIRE_RLS_INTEGRATION=1 tsx --test --test-concurrency=1 test/exchange-rates-port.test.ts && pnpm test:rls:upgrade'
  );
  assert.equal(
    billingScripts['test:rls:upgrade'],
    'node ../../scripts/ci/run-wp07-legacy-upgrade.mjs'
  );
});

test('release candidate and Mac verification both reach the required legacy upgrade lane', () => {
  const rc = Object.values(releaseCandidate.jobs).find(job =>
    findStep(job.steps ?? [], 'RC check - pr:verify:hosts')
  );
  assert.ok(rc);
  const checkout = rc.steps.find(step => step.uses === 'actions/checkout@v5');
  assert.equal(checkout?.with?.['fetch-depth'], 0);
  assert.match(findStep(rc.steps, 'RC check - pr:verify:hosts').run, /^pnpm pr:verify:hosts\b/mu);

  const rootScripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const hosts = fs.readFileSync(path.join(root, 'scripts/pr-verify-hosts.sh'), 'utf8');
  assert.equal(rootScripts['pr:verify:hosts'], 'bash scripts/pr-verify-hosts.sh');
  assert.match(hosts, /^pnpm pr:verify$/mu);
  assert.ok(rootScripts['pr:verify'].split(' && ').includes('pnpm db:rls:test:required'));
  assert.equal(
    rootScripts['db:rls:test:required'],
    'REQUIRE_RLS_INTEGRATION=1 REQUIRE_RLS_COVERAGE=1 node scripts/run-with-default-db-url.mjs pnpm db:rls:test'
  );
});

test('legacy upgrade lane provisions the pinned source and passes it only to the proof', async () => {
  const { runLegacyUpgrade } = await import('./run-wp07-legacy-upgrade.mjs');
  const originalSource = process.env.WP07_LEGACY_SOURCE;
  const calls = [];
  runLegacyUpgrade((command, args, options) => calls.push({ command, args, options }));

  const [clone, checkout, install, proof] = calls;
  const source = clone.args.at(-1);
  assert.deepEqual(
    calls.map(call => call.command),
    ['git', 'git', 'pnpm', 'tsx']
  );
  assert.deepEqual(clone.args, ['clone', '--quiet', '--shared', '--no-checkout', root, source]);
  assert.deepEqual(checkout.args, [
    '-C',
    source,
    'checkout',
    '--quiet',
    '--detach',
    'bc19469b5479f47b63eab258249984a974d26199',
  ]);
  assert.deepEqual(install.args, [
    '--dir',
    source,
    'install',
    '--frozen-lockfile',
    '--prefer-offline',
    '--ignore-scripts',
  ]);
  assert.deepEqual(proof.args, [
    '--test',
    '--test-concurrency=1',
    'test/exchange-rates-upgrade.test.ts',
  ]);
  assert.equal(proof.options.cwd, path.join(root, 'packages/domain-membership-billing'));
  assert.equal(proof.options.env.WP07_LEGACY_SOURCE, source);
  assert.equal(proof.options.env.REQUIRE_RLS_INTEGRATION, '1');
  assert.equal(process.env.WP07_LEGACY_SOURCE, originalSource);
  assert.equal(fs.existsSync(source), false);
});

test('legacy upgrade lane fails closed on missing source, dependencies or a failing proof', async () => {
  const { runLegacyUpgrade } = await import('./run-wp07-legacy-upgrade.mjs');
  for (const [failedCall, phase] of [
    [2, /checking out the pinned revision/u],
    [3, /installing the legacy dependencies/u],
    [4, /running the PostgreSQL 16 upgrade proof/u],
  ]) {
    let calls = 0;
    let source;
    assert.throws(
      () =>
        runLegacyUpgrade((_command, args) => {
          calls++;
          if (calls === 1) source = args.at(-1);
          if (calls === failedCall) throw new Error('simulated failure');
        }),
      phase
    );
    assert.equal(calls, failedCall);
    assert.equal(fs.existsSync(source), false);
  }
});

test('legacy upgrade command exits nonzero when it cannot provision source', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/run-wp07-legacy-upgrade.mjs'], {
    cwd: root,
    env: { PATH: '/dev/null' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /legacy upgrade failed while cloning the local repository/u);
});
