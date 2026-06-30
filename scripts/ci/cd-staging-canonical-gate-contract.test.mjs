import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readCdWorkflow() {
  return yaml.load(fs.readFileSync(path.join(rootDir, '.github/workflows/cd.yml'), 'utf8'));
}

function findStep(steps, name) {
  return steps.find(step => step?.name === name);
}

test('CD staging gate runs only against canonical staging without deployment fallback', () => {
  const workflow = readCdWorkflow();
  assert.equal(workflow.concurrency.group, 'cd-staging-canonical-${{ github.repository }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.doesNotMatch(workflow.concurrency.group, /github\.(?:ref|run_id)/u);

  const e2eStagingJob = workflow.jobs['e2e-staging'];
  assert.equal(e2eStagingJob.env.BASE_URL, '${{ needs.deploy-staging.outputs.gate_base_url }}');
  assert.equal(e2eStagingJob.env.AUTH_BASE_URL, 'https://staging.interdomestik.com');
  assert.equal(e2eStagingJob.env.RELEASE_GATE_ALLOW_DEPLOYMENT_FALLBACK, 'false');
  assert.equal(
    e2eStagingJob.env.RELEASE_GATE_EXTRA_HOSTNAME,
    '${{ needs.deploy-staging.outputs.hostname }}'
  );
  const gateStep = findStep(e2eStagingJob.steps, 'Run Staging Release Gate');
  assert.ok(gateStep);
  assert.match(gateStep.env.VERCEL_AUTOMATION_BYPASS_SECRET, /secrets\.VERCEL/u);
  assert.match(gateStep.run, /release:gate:raw/);
});
