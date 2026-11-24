import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import yaml from 'js-yaml';
import { selectContractSuite } from './contract-suite-surface.mjs';
import { evaluateExactHeadCertification } from './exact-head-certification-lib.mjs';
import { evaluatePrGatePolicy } from './pr-gate-policy-lib.mjs';
import { evaluateValidationSurface } from './validation-surface-policy-lib.mjs';

const workflow = file =>
  readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8');
const ci = yaml.load(workflow('ci.yml'));
const audit = ci.jobs.audit;
const step = audit.steps.find(item => item.name === 'Run Audits');
const condition =
  "github.event_name != 'pull_request' || github.event.pull_request.draft == false || needs.validation-surface.outputs.run_broad == 'true'";

test('required CI runs the suite first in Run Audits and guards the heavy checks', () => {
  const names = audit.steps.map(item => item.name);
  assert.equal(names.filter(name => name === 'Run Audits').length, 1);
  assert.ok(!names.includes('Run contract suite'));
  const index = names.indexOf('Run Audits');
  assert.equal(names[index - 1], 'Run lightweight governance audits');
  assert.equal(step.if, condition);
  assert.deepEqual(step.env, {
    EVENT_NAME: '${{ github.event_name }}',
    BASE_SHA: '${{ github.event.pull_request.base.sha }}',
    HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    PR_DRAFT: '${{ github.event.pull_request.draft }}',
    RUN_BROAD: '${{ needs.validation-surface.outputs.run_broad }}',
  });
  assert.doesNotMatch(step.run, /\$\{\{/u);
  assert.equal(step['continue-on-error'], undefined);
  assert.equal(audit['continue-on-error'], undefined);
  const commands = step.run
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  assert.deepEqual(commands, [
    'node scripts/ci/contract-suite-run.mjs',
    'if [[ "$RUN_BROAD" == "true" ]]; then',
    'node scripts/check-env-ci.mjs',
    'pnpm check:e2e-contracts',
    'pnpm check:tenant-guard',
    'pnpm check:architecture-boundaries',
    'pnpm lint:production-warnings',
    'pnpm purity:audit',
    'pnpm db:migrations:check-journal',
    'fi',
  ]);
});

function laneFor({ eventName = 'pull_request', draft, file, labels = [], action = 'synchronize' }) {
  const changedFiles = file ? [file] : [];
  const policyInput = { eventName, draft, labels, changedFiles, changedFilesComplete: true };
  const policy = evaluatePrGatePolicy(policyInput);
  const surface = evaluateValidationSurface(policyInput);
  const { runBroad } = evaluateExactHeadCertification({
    ...policyInput,
    action,
    policyShouldRun: surface.shouldRun,
    policyRunFull: policy.runFull,
    policyForceFull: policy.forceFull,
    policyReason: policy.reason,
    runAttempt: 1,
    sameRepository: true,
  });
  const values = new Map([
    ["github.event_name != 'pull_request'", eventName !== 'pull_request'],
    ['github.event.pull_request.draft == false', draft === false],
    ["needs.validation-surface.outputs.run_broad == 'true'", runBroad],
  ]);
  const clauses = step.if.split(' || ');
  for (const clause of clauses) assert.ok(values.has(clause), clause);
  if (!clauses.some(clause => values.get(clause))) return { runBroad, lane: 'skipped' };

  const baseSha = 'a'.repeat(40);
  const headSha = 'b'.repeat(40);
  const diff = `M\0${file}\0`;
  const { lane } = selectContractSuite({
    eventName,
    baseSha,
    headSha,
    draft,
    parents: [baseSha, headSha],
    prDiff: diff,
    testedDiff: diff,
    baseHasRoots: true,
    testedHasRoots: true,
  });
  return { runBroad, lane };
}

test('ordinary drafts skip and policy-admitted drafts run the full lane', () => {
  const file = 'apps/web/src/view.tsx';
  assert.deepEqual(laneFor({ draft: true, file }), { runBroad: false, lane: 'skipped' });
  assert.deepEqual(laneFor({ draft: true, file: 'packages/domain-privacy/src/consent.ts' }), {
    runBroad: true,
    lane: 'full',
  });
  assert.deepEqual(laneFor({ draft: true, file, labels: ['full-gate'] }), {
    runBroad: true,
    lane: 'full',
  });
});

test('ready tooling and docs PRs get their lane even when broad audits are skipped', () => {
  assert.deepEqual(laneFor({ draft: false, file: 'scripts/ci/check.mjs' }), {
    runBroad: false,
    lane: 'full',
  });
  assert.deepEqual(laneFor({ draft: false, file: 'docs/guide.md' }), {
    runBroad: false,
    lane: 'product',
  });
});

test('main push filters and cancellation survive, and an admitted push uses the full lane', () => {
  assert.ok(ci.on.push.branches.includes('main'));
  assert.deepEqual(ci.on.push['paths-ignore'], ['docs/**', 'scripts/repo-size-budget.json']);
  assert.equal(ci.concurrency.group, 'ci-${{ github.ref }}');
  assert.equal(ci.concurrency['cancel-in-progress'], true);
  assert.deepEqual(laneFor({ eventName: 'push' }), { runBroad: true, lane: 'full' });
});

test('nightly runs the full suite on main with read-only checkout and no secrets', () => {
  const source = workflow('contracts-nightly.yml');
  const nightly = yaml.load(source);
  assert.deepEqual(nightly.on, { schedule: [{ cron: '0 3 * * *' }], workflow_dispatch: {} });
  assert.deepEqual(nightly.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(nightly.jobs), ['contracts']);
  const job = nightly.jobs.contracts;
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.permissions, undefined);
  assert.equal(job['continue-on-error'], undefined);
  const [checkout, setup, run] = job.steps;
  assert.equal(job.steps.length, 3);
  assert.match(checkout.uses, /^actions\/checkout@[0-9a-f]{40}$/u);
  assert.equal(
    checkout.uses,
    audit.steps.find(item => item.uses?.startsWith('actions/checkout@')).uses
  );
  assert.deepEqual(checkout.with, { ref: 'main', 'fetch-depth': 0, 'persist-credentials': false });
  assert.deepEqual(setup, { uses: './.github/actions/setup' });
  assert.equal(run.run, 'pnpm test:ci:contracts:parallel');
  assert.equal(run.if, undefined);
  assert.equal(run['continue-on-error'], undefined);
  assert.doesNotMatch(source, /\bsecrets\b/iu);
  assert.equal(nightly.env, undefined);
  assert.equal(job.env, undefined);
  assert.ok(job.steps.every(item => item.env === undefined));
});
