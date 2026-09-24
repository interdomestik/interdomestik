import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const action = yaml.load(
  readFileSync(resolve(root, '.github/actions/validation-surface/action.yml'), 'utf8')
);
const workflow = yaml.load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'));

test('validation surface exposes fail-closed legacy selection from exact event identities', () => {
  for (const output of [
    'legacy_validation_should_run',
    'legacy_validation_reason',
    'legacy_validation_matched_paths',
  ]) {
    assert.ok(action.outputs[output], output);
    assert.ok(workflow.jobs['validation-surface'].outputs[output], output);
  }

  const step = action.runs.steps.find(item => item.id === 'legacy_validation');
  assert.ok(step);
  assert.match(step.env.BASE_SHA, /pull_request\.base\.sha/u);
  assert.match(step.env.BASE_SHA, /github\.event\.before/u);
  assert.match(step.env.HEAD_SHA, /pull_request\.head\.sha/u);
  assert.match(step.run, /legacy-validation-surface\.mjs/u);
  assert.match(step.run, /--base "\$BASE_SHA"/u);
  assert.match(step.run, /--head "\$HEAD_SHA"/u);
});

test('ordinary audit retains shared safety tests and selects the full legacy suite separately', () => {
  const steps = workflow.jobs.audit.steps;
  const ordinary = steps.find(item => item.name === 'Run lightweight governance audits');
  assert.match(ordinary.env.LEGACY_VALIDATION_SHOULD_RUN, /legacy_validation_should_run/u);
  assert.match(ordinary.run, /if \[\[ "\$LEGACY_VALIDATION_SHOULD_RUN" == "true" \]\]/u);
  assert.match(ordinary.run, /pnpm legacy:validate/u);
  assert.match(ordinary.run, /else\s+pnpm test:delivery-safety/u);
});
