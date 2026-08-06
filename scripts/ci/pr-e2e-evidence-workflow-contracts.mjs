import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('PR E2E runner keeps gate and smoke evidence lanes separate', () => {
  const gate = findStep('Run PR E2E Gate');
  const smoke = findStep('Run PR Smoke E2E');
  assert.ok(smoke);
  assert.equal(smoke.run, 'pnpm --filter @interdomestik/web run e2e:smoke');
  assert.deepEqual(gate.env, {
    E2E_DATABASE_URL: '${{ env.DATABASE_URL }}',
    E2E_DATABASE_URL_RLS: '${{ env.DATABASE_URL }}',
    PW_EVIDENCE_LANE: 'pr-gate',
  });
  assert.equal(smoke.env.PW_EVIDENCE_LANE, 'pr-smoke');
});

test('PR E2E uploads exact-head lane reports and canonical evidence summaries', () => {
  const checkout = runner.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  const gateIndex = runner.steps.findIndex(step => step?.name === 'Run PR E2E Gate');
  const smokeIndex = runner.steps.findIndex(step => step?.name === 'Run PR Smoke E2E');
  const gateEvidence = runner.steps[gateIndex + 1];
  const smokeEvidence = runner.steps[smokeIndex + 1];
  const evidenceRuns = runner.steps
    .filter(step => step?.run?.startsWith('node scripts/ci/playwright-lane-evidence.mjs'))
    .map(step => step.run);

  assert.equal(gateEvidence.name, 'Summarize PR Gate E2E Evidence');
  assert.equal(gateEvidence.if, 'always()');
  assert.equal(smokeEvidence.name, 'Summarize PR Smoke E2E Evidence');
  assert.equal(smokeEvidence.if, 'always()');
  assert.equal(runner.env.EVIDENCE_HEAD_SHA, HEAD_EXPRESSION);
  assert.equal(checkout.with.ref, HEAD_EXPRESSION);
  assert.equal(checkout.with['fetch-depth'], 1);
  assert.deepEqual(evidenceRuns, [
    'node scripts/ci/playwright-lane-evidence.mjs --report=apps/web/test-results/pr-gate/report.json --head=${EVIDENCE_HEAD_SHA} --lane=pr-gate --out=tmp/verification-evidence/pr-gate.json',
    'node scripts/ci/playwright-lane-evidence.mjs --report=apps/web/test-results/pr-smoke/report.json --head=${EVIDENCE_HEAD_SHA} --lane=pr-smoke --out=tmp/verification-evidence/pr-smoke.json',
  ]);
  const headArgument = '--head=${EVIDENCE_HEAD_SHA}';
  assert.ok(evidenceRuns.every(run => run.split(headArgument).length === 2));

  const upload = findStep('Upload PR E2E Verification Evidence');
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with.name, 'verification-evidence-e2e-pr');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.deepEqual(upload.with.path.trim().split(/\s*\n\s*/u), [
    'tmp/verification-evidence/pr-gate.json',
    'tmp/verification-evidence/pr-smoke.json',
    'apps/web/test-results/pr-gate/report.json',
    'apps/web/test-results/pr-smoke/report.json',
  ]);
});
