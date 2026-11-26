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
const releaseHostVerifier = {
  name: 'RC check - pr:verify:hosts',
  command: 'pr:verify:hosts',
  receipt: 'pr_verify_hosts',
};
const releaseUpgrade = {
  name: 'Prepare CI database',
  command: 'db:wp07:legacy-upgrade',
  receipt: 'wp07_legacy_upgrade',
  script: 'scripts/ci/rc-wp07-legacy-upgrade.sh',
};
const legacyLockfileBlob = '30c68285cd04754daed56c49bc8fad334dee72b9';

function assertRlsRun(command) {
  assert.equal(command, 'pnpm db:rls:test');
}

function assertRequiredRcStep(step, { name, command, receipt, script }, scriptSource) {
  const logDir = '${RC_LOGS_DIR}';
  const run = [
    'set -euo pipefail',
    `log_file="${logDir}/${receipt}.log"`,
    'set +e',
    `pnpm ${command} 2>&1 | tee "\${log_file}"`,
    'exit_code=${PIPESTATUS[0]}',
    'set -e',
    `printf '%s\\n' "\${exit_code}" > "${logDir}/${receipt}.exit"`,
    'exit "${exit_code}"',
    '',
  ].join('\n');
  const workflowRun = script
    ? `set -euo pipefail
until pg_isready -h 127.0.0.1 -p 5432 -U postgres; do
  echo "Waiting for postgres..."
  sleep 2
done
pnpm db:migrate
pnpm seed:e2e
pnpm seed:assert-e2e
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test bash ${script}
`
    : run;
  assert.deepEqual(step, { name, shell: 'bash', run: workflowRun });
  if (script) assert.equal(scriptSource, `#!/usr/bin/env bash\n${run}`);
}

for (const contract of [releaseHostVerifier, releaseUpgrade]) {
  test(`${contract.name} rejects skipped, malformed, and fail-open steps`, () => {
    const step = findStep(releaseCandidate.jobs['rc-gate'].steps, contract.name);
    const scriptSource = contract.script
      ? fs.readFileSync(path.join(root, contract.script), 'utf8')
      : undefined;
    const invalidSteps = [
      ['missing step', undefined],
      ['empty command', { ...step, run: '' }],
      ['unparseable command', { ...step, run: 'if' }],
      ['valid but empty step', {}],
      ['successful exit before the command', { ...step, run: `exit 0\n${step.run}` }],
      ['skipped by workflow condition', { ...step, if: 'false' }],
      ['ignored failure', { ...step, 'continue-on-error': true }],
    ];
    for (const [reason, candidate] of invalidSteps) {
      assert.throws(
        () => assertRequiredRcStep(candidate, contract, scriptSource),
        { code: 'ERR_ASSERTION' },
        reason
      );
    }

    const body = scriptSource ?? step.run;
    const invalidBodies = [
      ['missing body', undefined],
      ['empty body', ''],
      ['unparseable body', 'if'],
      ['valid but empty body', '#!/usr/bin/env bash\n'],
      ['successful exit before the proof', `exit 0\n${body}`],
      ['exit status from tee', body.replace('PIPESTATUS[0]', 'PIPESTATUS[1]')],
      ['hardcoded successful exit', body.replace('exit "${exit_code}"', 'exit 0')],
    ];
    for (const [reason, candidate] of invalidBodies) {
      assert.throws(
        () =>
          contract.script
            ? assertRequiredRcStep(step, contract, candidate)
            : assertRequiredRcStep({ ...step, run: candidate }, contract),
        { code: 'ERR_ASSERTION' },
        reason
      );
    }
  });
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
  assert.equal(
    communicationsScripts['test:rls'],
    'pnpm --filter @interdomestik/domain-claims test:rls'
  );
  const claimsScripts = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/domain-claims/package.json'), 'utf8')
  ).scripts;
  // Each message suite grants its own role on shared catalog rows, so files run one at a time.
  assert.equal(
    claimsScripts['test:rls'],
    'MESSAGE_RLS_INTEGRATION=1 REQUIRE_RLS_INTEGRATION=1 vitest run --no-file-parallelism src/claims/message-integration/tenant-context.integration.test.ts src/claims/message-integration/send-negative-matrix.integration.test.ts src/claims/message-integration/send-idempotency.integration.test.ts src/claims/message-integration/send-reassignment.integration.test.ts src/claims/message-integration/public-reply-notification.integration.test.ts'
  );
  assert.equal(
    billingScripts['test:rls'],
    'BILLING_RLS_INTEGRATION=1 REQUIRE_RLS_INTEGRATION=1 vitest run --no-file-parallelism src/port/individual-sales.rls.test.ts src/port/individual-sale-age-boundary.rls.test.ts src/port/individual-sale-weekly-rate.rls.test.ts src/sponsors/sponsor-privacy.rls.test.ts && REQUIRE_RLS_INTEGRATION=1 tsx --test --test-concurrency=1 test/exchange-rates-port.test.ts'
  );
  assert.equal(billingScripts['test:rls:upgrade'], undefined);
});

test('release candidate requires the host verifier and runs the PG16 legacy upgrade after seeding', () => {
  const rc = releaseCandidate.jobs['rc-gate'];
  assert.equal(rc.if, undefined);
  assert.equal(rc['continue-on-error'], undefined);
  assert.equal(rc.services.postgres.image, 'postgres:16');
  const checkout = rc.steps.find(step => step.uses === 'actions/checkout@v5');
  assert.equal(checkout?.with?.['fetch-depth'], 0);
  assertRequiredRcStep(findStep(rc.steps, releaseHostVerifier.name), releaseHostVerifier);
  const upgrade = findStep(rc.steps, releaseUpgrade.name);
  const build = findStep(rc.steps, 'Build web standalone artifact');
  const scriptSource = fs.readFileSync(path.join(root, releaseUpgrade.script), 'utf8');
  assertRequiredRcStep(upgrade, releaseUpgrade, scriptSource);
  assert.ok(rc.steps.indexOf(upgrade) < rc.steps.indexOf(build));
  assert.deepEqual(releaseCandidate.on, {
    push: { branches: ['rc/*'] },
    workflow_dispatch: null,
  });
  assert.doesNotMatch(
    JSON.stringify(workflow.jobs),
    /db:wp07:legacy-upgrade|(?:run|rc)-wp07-legacy-upgrade/u
  );
});

test('Mac verification runs shared RLS coverage independently of the legacy install', () => {
  const rootScripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const hosts = fs.readFileSync(path.join(root, 'scripts/pr-verify-hosts.sh'), 'utf8');
  assert.equal(rootScripts['pr:verify:hosts'], 'bash scripts/pr-verify-hosts.sh');
  assert.equal(
    rootScripts['db:wp07:legacy-upgrade'],
    'node scripts/ci/run-wp07-legacy-upgrade.mjs'
  );
  assert.match(hosts, /^pnpm pr:verify$/mu);
  assert.doesNotMatch(
    [hosts, rootScripts['pr:verify'], rootScripts['db:rls:test:required']].join('\n'),
    /db:wp07:legacy-upgrade|test:rls:upgrade|(?:run|rc)-wp07-legacy-upgrade/u
  );
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
  runLegacyUpgrade((command, args, options) => {
    calls.push({ command, args, options });
    return `${legacyLockfileBlob}\n`;
  });

  const [clone, checkout, lockfile, install, proof] = calls;
  const source = clone.args.at(-1);
  assert.deepEqual(
    calls.map(call => call.command),
    ['git', 'git', 'git', 'pnpm', 'tsx']
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
  assert.deepEqual(lockfile.args, ['hash-object', '--no-filters', 'pnpm-lock.yaml']);
  assert.equal(lockfile.options.cwd, source);
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
    [3, /verifying the pinned lockfile/u],
    [4, /installing the legacy dependencies/u],
    [5, /running the PostgreSQL 16 upgrade proof/u],
  ]) {
    let calls = 0;
    let source;
    assert.throws(
      () =>
        runLegacyUpgrade((_command, args) => {
          calls++;
          if (calls === 1) source = args.at(-1);
          if (calls === failedCall) throw new Error('simulated failure');
          return legacyLockfileBlob;
        }),
      phase
    );
    assert.equal(calls, failedCall);
    assert.equal(fs.existsSync(source), false);
  }
});

test('legacy upgrade rejects the wrong lockfile before installing dependencies', async () => {
  const { runLegacyUpgrade } = await import('./run-wp07-legacy-upgrade.mjs');
  const calls = [];
  assert.throws(
    () =>
      runLegacyUpgrade(command => {
        calls.push(command);
        return '0000000000000000000000000000000000000000\n';
      }),
    /verifying the pinned lockfile/u
  );
  assert.deepEqual(calls, ['git', 'git', 'git']);
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
