import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const trustedAction =
  'interdomestik/interdomestik/.github/actions/pr-gate-policy@f4b39fc4f7fed7e875363807faea11cc2c4cf717';
const targets = [
  ['ci.yml', 'validation-surface'],
  ['e2e-pr.yml', 'e2e-preflight'],
  ['pilot-gate.yml', 'pilot-gate-preflight'],
  ['pr-deterministic-backstops.yml', 'draft-policy'],
  ['pr-finalizer.yml', 'pr-finalizer'],
];

test('all PR gate callers pin the trusted bootstrap action SHA', () => {
  for (const [workflowName, jobName] of targets) {
    const workflow = yaml.load(
      fs.readFileSync(path.join(root, '.github/workflows', workflowName), 'utf8')
    );
    let steps = workflow.jobs[jobName].steps;
    if (workflowName === 'ci.yml') {
      assert.equal(
        steps.find(step => step.id === 'validation')?.uses,
        './.github/actions/validation-surface'
      );
      steps = yaml.load(
        fs.readFileSync(path.join(root, '.github/actions/validation-surface/action.yml'), 'utf8')
      ).runs.steps;
    }
    const policy = steps.find(step => step.id === 'gate_policy');
    assert.ok(policy, `${workflowName}/${jobName} must define gate_policy`);
    assert.equal(policy.uses, trustedAction, workflowName);
  }
});
