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

test('PR finalizer forces current-head required-check polling for the full lane', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  const runStep = workflow.jobs['pr-finalizer'].steps.find(
    step => step?.name === 'Run PR finalizer gate'
  );

  assert.ok(runStep);
  assert.equal(runStep.env.PR_FINALIZER_SKIP_CHECK_POLLING, 'false');
  assert.equal(runStep.env.PR_FINALIZER_MAX_CHECK_RETRIES, '420');
});

test('PR finalizer delegates Sonar validation to governance monitoring in CI', () => {
  const finalizerLib = fs.readFileSync(path.join(rootDir, 'scripts/pr-finalizer-lib.sh'), 'utf8');

  assert.match(finalizerLib, /Sonar state is reported by governance monitoring/);
  assert.match(finalizerLib, /\$\{GITHUB_ACTIONS:-\}" == "true"/);
});
