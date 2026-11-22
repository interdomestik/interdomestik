import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '../..');
const HEAD_EXPRESSION = '${{ github.event.pull_request.head.sha || github.sha }}';
const workflow = yaml.load(
  fs.readFileSync(path.join(root, '.github/workflows/e2e-pr.yml'), 'utf8')
);
const runner = workflow.jobs['e2e-runner'];
const findStep = name => runner.steps.find(step => step?.name === name);
const gateName = 'Run PR E2E Gate';
const smokeName = 'Run PR Smoke E2E';
const summaryName = 'Summarize PR E2E Evidence';
const uploadName = 'Upload PR E2E Verification Evidence';

test('PR E2E pins the three parallel lanes and aggregates their result', () => {
  assert.equal(runner.name, 'PR E2E Runner (${{ matrix.lane }})');
  assert.equal(runner.if, "needs.e2e-preflight.outputs.run_broad == 'true'");
  assert.deepEqual(runner.strategy, {
    'fail-fast': false,
    matrix: {
      include: [
        {
          lane: 'gate-ks-sq',
          kind: 'gate',
          script_lane: 'pr-ks',
          evidence_name: 'pr-gate-ks-sq',
          report_lane: 'pr-gate',
        },
        {
          lane: 'gate-mk-contract',
          kind: 'gate',
          script_lane: 'pr-mk-contract',
          evidence_name: 'pr-gate-mk-contract',
          report_lane: 'pr-gate',
        },
        {
          lane: 'smoke',
          kind: 'smoke',
          script_lane: 'pr-smoke',
          evidence_name: 'pr-smoke',
          report_lane: 'pr-smoke',
        },
      ],
    },
  });
  assert.equal(workflow.jobs.e2e.steps.length, 1);
  assert.equal(workflow.jobs.e2e.steps[0].with['runner-result'], '${{ needs.e2e-runner.result }}');
});

test('PR E2E runs strict guards and one required browser step on each lane', () => {
  const gate = findStep(gateName);
  const smoke = findStep(smokeName);
  const guards = findStep('Strict Rule Guards (golden/gate)');
  assert.equal(guards.run, 'pnpm --filter @interdomestik/web run e2e:guards');
  assert.ok(runner.steps.indexOf(guards) < runner.steps.indexOf(gate));
  assert.ok(runner.steps.indexOf(guards) < runner.steps.indexOf(smoke));
  assert.equal(gate.run, 'node scripts/run-e2e-lane.mjs "$E2E_LANE"');
  assert.equal(smoke.run, 'node scripts/run-e2e-lane.mjs pr-smoke');
  const databaseEnv = {
    E2E_DATABASE_URL: '${{ env.DATABASE_URL }}',
    E2E_DATABASE_URL_RLS: '${{ env.DATABASE_URL }}',
  };
  assert.deepEqual(gate.env, {
    ...databaseEnv,
    E2E_LANE: '${{ matrix.script_lane }}',
    E2E_MAILPIT_API: 'http://127.0.0.1:8025',
    E2E_OTP_PROOF_REQUIRED: '1',
    E2E_SMTP_HOST: '127.0.0.1',
    E2E_SMTP_PORT: '1025',
    OTP_RATE_LIMIT_HMAC_SECRET:
      "${{ secrets.OTP_RATE_LIMIT_HMAC_SECRET || 'test-otp-rate-secret-for-ci-only-not-production' }}",
    PW_EVIDENCE_LANE: 'pr-gate',
  });
  assert.deepEqual(smoke.env, { ...databaseEnv, PW_EVIDENCE_LANE: 'pr-smoke' });

  const conditionalSteps = runner.steps.filter(step => Object.hasOwn(step, 'if'));
  assert.deepEqual(
    conditionalSteps.map(step => [step.name, step.if]),
    [
      [gateName, "matrix.kind == 'gate'"],
      [smokeName, "matrix.kind == 'smoke'"],
      [summaryName, 'always()'],
      [uploadName, 'always()'],
    ]
  );
  assert.equal(runner['continue-on-error'], undefined);
  for (const shell of [workflow.defaults?.run?.shell, runner.defaults?.run?.shell]) {
    assert.doesNotMatch(shell ?? '', /^bash\s+\{0\}$/u);
  }
  for (const step of runner.steps) {
    assert.equal(step['continue-on-error'], undefined);
    assert.doesNotMatch(step.shell ?? '', /^bash\s+\{0\}$/u);
    assert.doesNotMatch(step.run ?? '', /\|\|\s*true\b|\$\{\{/u);
  }
  assert.equal(
    runner.services.postgres.image,
    'docker.io/library/postgres:16@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'
  );
  assert.match(
    runner.services.mailpit.image,
    /^axllent\/mailpit:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/
  );
});

test('PR E2E always uploads each lane’s exact-head report and evidence summary by attempt', () => {
  const checkout = runner.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  const summary = findStep(summaryName);
  const upload = findStep(uploadName);
  assert.equal(runner.env.EVIDENCE_HEAD_SHA, HEAD_EXPRESSION);
  assert.equal(checkout.with.ref, HEAD_EXPRESSION);
  assert.equal(checkout.with['fetch-depth'], 1);
  const evidenceSteps = runner.steps.filter(step =>
    step?.run?.startsWith('node scripts/ci/playwright-lane-evidence.mjs')
  );
  assert.deepEqual(evidenceSteps, [summary]);
  // On every matrix leg, the evidence summary must be the very next step after that leg's
  // browser run, and the upload the step after it: nothing may touch report.json in between.
  for (const { kind } of runner.strategy.matrix.include) {
    const otherKind = kind === 'gate' ? 'smoke' : 'gate';
    const legSteps = runner.steps.filter(step => step.if !== `matrix.kind == '${otherKind}'`);
    const browser = findStep(kind === 'gate' ? gateName : smokeName);
    const browserIndex = legSteps.indexOf(browser);
    assert.ok(browserIndex >= 0, kind);
    assert.equal(legSteps[browserIndex + 1], summary, kind);
    assert.equal(legSteps[browserIndex + 2], upload, kind);
    assert.equal(legSteps.length, browserIndex + 3, kind);
  }
  assert.equal(summary.if, 'always()');
  assert.deepEqual(summary.env, {
    EVIDENCE_NAME: '${{ matrix.evidence_name }}',
    REPORT_LANE: '${{ matrix.report_lane }}',
  });
  assert.equal(
    summary.run,
    'node scripts/ci/playwright-lane-evidence.mjs --report="apps/web/test-results/$REPORT_LANE/report.json" --head="$EVIDENCE_HEAD_SHA" --lane="$EVIDENCE_NAME" --out="tmp/verification-evidence/$EVIDENCE_NAME.json"'
  );
  assert.equal(upload.if, 'always()');
  assert.equal(upload.uses, 'actions/upload-artifact@v6');
  assert.equal(
    upload.with.name,
    'verification-evidence-e2e-pr-${{ matrix.lane }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}'
  );
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with['retention-days'], 7);
  assert.deepEqual(upload.with.path.trim().split('\n'), [
    'tmp/verification-evidence/${{ matrix.evidence_name }}.json',
    'apps/web/test-results/${{ matrix.report_lane }}/report.json',
  ]);
});

test('seed credential guard recognizes both split PR browser commands', t => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'pr-e2e-seed-guard-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const workflowDir = path.join(directory, '.github', 'workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  for (const name of ['Run PR E2E Gate', 'Run PR Smoke E2E']) {
    const { run } = findStep(name);
    fs.writeFileSync(
      path.join(workflowDir, 'e2e-pr.yml'),
      yaml.dump({ jobs: { 'e2e-runner': { steps: [{ run }] } } })
    );
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/check-workflow-seed-credentials.mjs')],
      { cwd: directory, encoding: 'utf8' }
    );
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, /seeded E2E jobs must export masked per-run credentials/u);
  }
});

test('PR E2E generates its own credentials before both browser steps', () => {
  const exporter = findStep('Generate ephemeral E2E credentials');
  assert.equal(exporter?.run, 'bash scripts/ci/export-e2e-credentials.sh');
  for (const name of [gateName, smokeName]) {
    assert.ok(runner.steps.indexOf(exporter) < runner.steps.indexOf(findStep(name)), name);
  }
});
