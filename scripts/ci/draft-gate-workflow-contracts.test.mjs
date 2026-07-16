import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVENT_TYPES = [
  'opened',
  'synchronize',
  'reopened',
  'ready_for_review',
  'converted_to_draft',
  'labeled',
];

function readWorkflow(name) {
  return yaml.load(fs.readFileSync(path.join(rootDir, '.github/workflows', name), 'utf8'));
}

function readAction(name) {
  return yaml.load(
    fs.readFileSync(path.join(rootDir, '.github/actions', name, 'action.yml'), 'utf8')
  );
}

function findStep(job, name) {
  return job.steps.find(step => step?.name === name);
}

function needs(job, dependency) {
  return [job.needs].flat().includes(dependency);
}

test('draft-aware workflows react to lifecycle and full-gate label events', () => {
  for (const name of [
    'ci.yml',
    'e2e-pr.yml',
    'pilot-gate.yml',
    'pr-deterministic-backstops.yml',
    'pr-finalizer.yml',
  ]) {
    assert.deepEqual(readWorkflow(name).on.pull_request.types, EVENT_TYPES, name);
  }
});

test('shared policy action keeps event data out of interpolated shell scripts', () => {
  const action = readAction('pr-gate-policy');
  const scripts = action.runs.steps.map(step => step.run).filter(Boolean);

  for (const script of scripts) {
    assert.doesNotMatch(script, /\$\{\{\s*(?:github|inputs|steps)\./u);
  }
});

test('CI exposes one effective heavy-lane decision while keeping required audit materialized', () => {
  const workflow = readWorkflow('ci.yml');
  const preflight = workflow.jobs['validation-surface'];
  const audit = workflow.jobs.audit;

  const policy = findStep(preflight, 'Evaluate PR gate policy');
  assert.equal(policy.uses, './.github/actions/pr-gate-policy');
  assert.equal(preflight.outputs.should_run, '${{ steps.gate_policy.outputs.should_run }}');
  assert.equal(preflight.outputs.run_full, '${{ steps.gate_policy.outputs.run_full }}');
  assert.ok(needs(audit, 'validation-surface'));
  assert.equal(
    findStep(audit, 'Run Audits').if,
    "needs.validation-surface.outputs.should_run == 'true'"
  );
  assert.ok(findStep(audit, 'Report quick draft lane'));
});

test('required PR E2E context wraps a service-free preflight and conditional heavy runner', () => {
  const workflow = readWorkflow('e2e-pr.yml');
  const preflight = workflow.jobs['e2e-preflight'];
  const runner = workflow.jobs['e2e-runner'];
  const wrapper = workflow.jobs.e2e;

  assert.equal(preflight.services, undefined);
  assert.ok(findStep(preflight, 'Evaluate PR gate policy'));
  assert.ok(needs(runner, 'e2e-preflight'));
  assert.equal(runner.if, "needs.e2e-preflight.outputs.should_run == 'true'");
  assert.ok(runner.services.postgres);
  assert.equal(wrapper.name, 'e2e');
  assert.equal(wrapper.if, 'always()');
  assert.equal(wrapper.services, undefined);
  assert.ok(needs(wrapper, 'e2e-preflight'));
  assert.ok(needs(wrapper, 'e2e-runner'));
});

test('pilot and optional deterministic backstops honor the shared full-lane decision', () => {
  const pilot = readWorkflow('pilot-gate.yml');
  const pilotPreflight = pilot.jobs['pilot-gate-preflight'];
  assert.ok(findStep(pilotPreflight, 'Evaluate PR gate policy'));
  assert.equal(
    pilot.jobs['pilot-gate-runner'].if,
    "needs.pilot-gate-preflight.outputs.should_run == 'true'"
  );

  const backstops = readWorkflow('pr-deterministic-backstops.yml');
  assert.ok(backstops.jobs['draft-policy']);
  for (const name of ['osv-scanner', 'semgrep-ce', 'reviewdog-eslint']) {
    assert.ok(needs(backstops.jobs[name], 'draft-policy'), name);
    assert.equal(backstops.jobs[name].if, "needs.draft-policy.outputs.run_full == 'true'", name);
  }
  assert.equal(
    backstops.jobs['dependency-review'].if,
    "needs.draft-policy.outputs.run_full == 'true' && github.event.repository.private == false"
  );
  assert.equal(backstops.jobs['osv-scanner'].with['upload-sarif'], false);
  const semgrepSteps = backstops.jobs['semgrep-ce'].steps;
  assert.ok(semgrepSteps.find(step => step?.name === 'Preserve Semgrep SARIF artifact'));
  assert.match(
    semgrepSteps.find(step => step?.name === 'Upload Semgrep SARIF').if,
    /repository\.private == false/u
  );
});

test('PR finalizer stays required but only attests full-lane current heads', () => {
  const workflow = readWorkflow('pr-finalizer.yml');
  const job = workflow.jobs['pr-finalizer'];
  const policy = findStep(job, 'Evaluate PR gate policy');
  const finalizer = findStep(job, 'Run PR finalizer gate');

  assert.ok(policy);
  assert.ok(findStep(job, 'Report quick draft lane'));
  assert.equal(policy.uses, './.github/actions/pr-gate-policy');
  assert.equal(finalizer.if, "steps.gate_policy.outputs.run_full == 'true'");
  assert.equal(finalizer.env.PR_FINALIZER_SKIP_CHECK_POLLING, 'false');
});
