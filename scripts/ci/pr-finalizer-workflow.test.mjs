import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readWorkflow(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

test('PR finalizer refreshes on the same review and review-comment activity as the delivery gate', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  assert.deepEqual(Object.keys(workflow.on), [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ]);
  assert.deepEqual(workflow.on.pull_request_review.types, ['submitted', 'edited', 'dismissed']);
  assert.deepEqual(workflow.on.pull_request_review_comment.types, ['created', 'edited', 'deleted']);
  assert.deepEqual(workflow.on.pull_request.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'converted_to_draft',
    'labeled',
  ]);
  assert.equal(
    workflow.jobs['pr-finalizer'].if,
    "github.event_name == 'pull_request' || (github.event.pull_request.state == 'open' && github.event.pull_request.draft == false && github.event.pull_request.base.ref == 'main' && github.event.pull_request.head.repo.full_name == github.repository)"
  );
});

test('PR finalizer forces current-head required-check polling for the full lane', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  assert.deepEqual(workflow.jobs['pr-finalizer'].permissions, {
    contents: 'read',
    actions: 'read',
    'pull-requests': 'read',
    checks: 'read',
    statuses: 'read',
  });
  const checkout = workflow.jobs['pr-finalizer'].steps.find(step =>
    step.uses?.startsWith('actions/checkout@')
  );
  const runStep = workflow.jobs['pr-finalizer'].steps.find(
    step => step?.name === 'Run PR finalizer gate'
  );

  assert.ok(checkout);
  assert.equal(checkout.with['fetch-depth'], 1);
  assert.ok(runStep);
  assert.equal(runStep.run.trim(), 'bash scripts/pr-finalizer.sh');
  assert.equal(runStep.env.PR_FINALIZER_SKIP_CHECK_POLLING, 'false');
  assert.equal(runStep.env.PR_FINALIZER_MAX_CHECK_RETRIES, '360');
  const setup = workflow.jobs['pr-finalizer'].steps.find(step =>
    step.uses?.startsWith('actions/setup-node@')
  );
  assert.equal(setup.with['node-version-file'], '.nvmrc');
  assert.equal(setup.with['package-manager-cache'], false);
  assert.ok(
    workflow.jobs['pr-finalizer'].steps.every(step => step.uses !== './.github/actions/setup'),
    'attestation needs Node and GitHub tools, not application dependencies'
  );
});

test('PR finalizer delegates Sonar validation to governance monitoring in CI', () => {
  const finalizerLib = fs.readFileSync(path.join(rootDir, 'scripts/pr-finalizer-lib.sh'), 'utf8');

  assert.match(finalizerLib, /Sonar state is reported by governance monitoring/);
  assert.match(finalizerLib, /\$\{GITHUB_ACTIONS:-\}" == "true"/);
});
