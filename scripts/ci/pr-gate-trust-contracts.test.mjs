import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const action = yaml.load(
  fs.readFileSync(path.join(root, '.github/actions/pr-gate-policy/action.yml'), 'utf8')
);
const step = id => action.runs.steps.find(candidate => candidate.id === id);

test('the shared gate action executes policy scripts from its pinned checkout', () => {
  const changedFiles = step('changed-files');
  const trustedRoot = '${{ github.action_path }}/../../..';

  for (const policyStep of [
    step('changed-files'),
    step('validation'),
    step('policy'),
    step('ai-eval'),
  ]) {
    assert.equal(policyStep.env.POLICY_ROOT, trustedRoot);
    assert.match(policyStep.run, /"\$\{POLICY_ROOT\}\/scripts\/ci/u);
  }
  assert.match(changedFiles.run, /set -euo pipefail/u);
  assert.match(changedFiles.run, /Dispatch changed-file lookup failed/u);
});
