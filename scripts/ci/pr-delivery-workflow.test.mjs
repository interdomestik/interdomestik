import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('delivery workflow is API-only, exact-bound, acyclic, and default-deny', () => {
  const source = read('.github/workflows/pr-delivery-gate.yml');
  const workflow = yaml.load(source);
  const job = workflow.jobs['delivery-gate'];

  assert.ok(job);
  assert.equal(job['timeout-minutes'], 90);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.deepEqual(job.permissions, {
    actions: 'read',
    checks: 'read',
    contents: 'read',
    issues: 'read',
    'pull-requests': 'read',
    statuses: 'read',
  });
  assert.deepEqual(workflow.on.pull_request_review.types, ['submitted', 'edited', 'dismissed']);
  assert.deepEqual(workflow.on.pull_request_review_comment.types, ['created', 'edited', 'deleted']);
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ]);
  assert.ok(workflow.on.pull_request.types.includes('review_requested'));
  assert.ok(workflow.on.pull_request.types.includes('review_request_removed'));
  assert.deepEqual(Object.keys(workflow.jobs), ['delivery-gate']);
  assert.equal(job.needs, undefined);
  assert.match(job.if, /github\.event\.pull_request\.base\.ref == 'main'/u);
  assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/u);
  assert.ok(job.steps.some(step => String(step.uses).startsWith('actions/checkout@')));
  const checkout = job.steps.find(step => String(step.uses).startsWith('actions/checkout@'));
  assert.match(checkout.with.ref, /github\.sha/u);
  assert.ok(job.steps.some(step => String(step.run).includes('scripts/ci/pr-delivery-gate.mjs')));
  const gate = job.steps.find(step => String(step.run).includes('scripts/ci/pr-delivery-gate.mjs'));
  assert.match(gate.env.PR_NUMBER, /github\.event\.pull_request\.number/u);
  for (const forbidden of [
    'pnpm install',
    'npm install',
    'docker',
    'playwright',
    'seed',
    'database',
    'actions: write',
    '/rerun',
    'delivery-reconciler',
    'pull_request_target',
    'workflow_dispatch',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'iu'));
  }
  assert.doesNotMatch(source, /branchProtectionRules|requiredStatusCheckContexts/u);
  for (const binding of [
    'github.event.pull_request.base.sha',
    'github.event.pull_request.head.sha',
    'github.sha',
    'github.run_id',
    'github.run_attempt',
  ]) {
    assert.match(source, new RegExp(binding.replaceAll('.', String.raw`\.`)));
  }
});

test('manifest consumers are wired and finalizer never waits for delivery-gate', () => {
  const contractPath = 'scripts/ci/pr-delivery-contract.json';
  const contract = JSON.parse(read(contractPath));
  const finalizer = read('scripts/pr-finalizer.sh');
  const finalizerLib = read('scripts/pr-finalizer-lib.sh');
  const feedbackLib = read('scripts/pr-finalizer-feedback-lib.sh');
  const governance = read('scripts/github-pr-governance-report.mjs');
  const reviewReady = read('scripts/pr-review-ready.sh');

  for (const source of [finalizer, feedbackLib, governance, reviewReady]) {
    assert.match(source, /pr-delivery-contract\.json/u);
  }
  assert.match(finalizerLib, /PR_DELIVERY_CONTRACT/u);
  assert.match(finalizerLib, /Generator states are reported by governance monitoring/u);
  assert.doesNotMatch(finalizer, /required_checks=\(/u);
  assert.doesNotMatch(finalizerLib, /success.*skipped.*neutral/su);
  assert.doesNotMatch(reviewReady, /ALLOW_MISSING_COPILOT/u);
  assert.match(reviewReady, /pr-review-ready failed: invalid delivery contract/u);
  assert.doesNotMatch(governance, /request Copilot review/u);
  assert.ok(contract.finalizerLeafPrerequisites.every(item => item.context !== 'delivery-gate'));
});
