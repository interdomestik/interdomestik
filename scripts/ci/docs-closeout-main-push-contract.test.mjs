import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));

test('docs-only closeout merges skip main-push CI without weakening PR checks', () => {
  assert.deepEqual(workflow.on.push['paths-ignore'], ['docs/**', 'scripts/repo-size-budget.json']);
  assert.equal(workflow.on.pull_request['paths-ignore'], undefined);

  for (const requiredJob of ['validation-surface', 'audit', 'static', 'unit', 'e2e-gate']) {
    assert.ok(workflow.jobs[requiredJob], `missing required CI job: ${requiredJob}`);
  }
});
