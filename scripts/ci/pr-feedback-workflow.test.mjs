import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('feedback setup has exact structured ownership without admitting other actions', () => {
  assert.equal(
    structuredArtifactOwner('.github/actions/pr-feedback-setup/action.yml'),
    'pr-feedback-refresh-contract'
  );
  assert.equal(structuredArtifactOwner('.github/actions/pr-feedback-other/action.yml'), null);
  assert.equal(structuredArtifactOwner('.github/actions/pr-feedback-setup/other.yml'), null);
});

test('review feedback does not create approval-gated native workflow runs', () => {
  for (const file of ['pr-delivery-gate', 'pr-finalizer']) {
    const workflow = yaml.load(fs.readFileSync(`.github/workflows/${file}.yml`, 'utf8'));
    const subscribed = (event, action) => workflow.on[event]?.types.includes(action) ?? false;
    for (const action of ['submitted', 'edited', 'dismissed']) {
      assert.equal(subscribed('pull_request_review', action), false, `${file}: ${action}`);
    }
    for (const action of ['created', 'edited', 'deleted']) {
      assert.equal(subscribed('pull_request_review_comment', action), false, `${file}: ${action}`);
    }
    assert.equal(subscribed('pull_request', 'synchronize'), true);
  }
});

test('replacement controller uses protected source, serialized scheduling and no check/approval writes', () => {
  const file = '.github/workflows/pr-feedback-refresh.yml';
  assert.ok(
    fs.existsSync(file),
    'replacement controller must be wired before direct triggers are removed'
  );
  const workflow = yaml.load(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['schedule', 'workflow_dispatch']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.deepEqual(workflow.permissions, {});
  const job = workflow.jobs.refresh;
  assert.deepEqual(job.permissions, {
    contents: 'read',
    actions: 'write',
    issues: 'read',
    'pull-requests': 'read',
  });
  const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.workflow_sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.ok(job.steps.every(step => !step.uses || /@[a-f0-9]{40}$/u.test(step.uses)));
  const run = job.steps.find(step => step.run?.includes('pr-feedback-controller.mjs'));
  assert.equal(run.env.REFRESH_APPLY, 'true');
  for (const file of ['pr-delivery-gate', 'pr-finalizer']) {
    const native = yaml.load(fs.readFileSync(`.github/workflows/${file}.yml`, 'utf8'));
    const steps = Object.values(native.jobs)[0].steps;
    const capture = steps.findIndex(step => step.id === 'feedback');
    const marker = steps.findIndex(step =>
      step.name?.startsWith('${{ steps.feedback.outputs.marker')
    );
    const gate = steps.findIndex(step =>
      step.run?.includes(
        file === 'pr-finalizer' ? 'scripts/pr-finalizer.sh' : 'scripts/ci/pr-delivery-gate.mjs'
      )
    );
    assert.ok(
      capture >= 0 && capture < marker && marker === gate,
      `${file}: capture precedes validation`
    );
  }
});

test('snapshot capture does not break existing full draft or fork finalizer lanes', () => {
  const file = '.github/actions/pr-feedback-setup/action.yml';
  assert.ok(fs.existsSync(file), 'shared setup and snapshot action is missing');
  const action = yaml.load(fs.readFileSync(file, 'utf8'));
  const condition = action.runs.steps.find(step => step.id === 'feedback').if;
  const admitted = new Function('github', 'steps', `return (${condition});`);
  const steps = { certification: { outputs: { run_broad: 'true' } } };
  for (const [draft, state, branch, repo, want] of [
    [false, 'open', 'main', 'interdomestik/interdomestik', true],
    [true, 'open', 'main', 'interdomestik/interdomestik', false],
    [false, 'closed', 'main', 'interdomestik/interdomestik', false],
    [false, 'open', 'other', 'interdomestik/interdomestik', false],
    [false, 'open', 'main', 'contributor/fork', false],
  ]) {
    assert.equal(
      admitted(
        {
          repository: 'interdomestik/interdomestik',
          event: {
            pull_request: {
              draft,
              state,
              base: { ref: branch },
              head: { repo: { full_name: repo } },
            },
          },
        },
        steps
      ),
      want
    );
  }
});

test('snapshot failure cannot skip the required validator or suppress its failure', () => {
  const action = yaml.load(fs.readFileSync('.github/actions/pr-feedback-setup/action.yml', 'utf8'));
  const snapshot = action.runs.steps.find(step => step.id === 'feedback');
  assert.equal(snapshot['continue-on-error'], true);
  assert.equal(
    action.runs.steps[0]['continue-on-error'],
    undefined,
    'Node setup still fails normally'
  );
  for (const file of ['pr-delivery-gate', 'pr-finalizer']) {
    const workflow = yaml.load(fs.readFileSync(`.github/workflows/${file}.yml`, 'utf8'));
    const steps = Object.values(workflow.jobs)[0].steps;
    const validator = steps.find(step =>
      step.name?.startsWith('${{ steps.feedback.outputs.marker')
    );
    assert.ok(
      validator.name.includes(' || '),
      'unavailable snapshot uses the normal validator name'
    );
    assert.equal(validator['continue-on-error'], undefined, 'validator errors remain blocking');
    assert.ok(!validator.if?.includes('feedback'), 'snapshot output cannot gate validation');
  }
});
