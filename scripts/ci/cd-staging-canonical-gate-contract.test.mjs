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

test('temporary DNS pin runs after setup and before every staging network operation only', () => {
  const workflow = readCdWorkflow();
  const targets = new Map([
    ['deploy-staging', 'Deploy Staging to Vercel'],
    ['e2e-staging', 'Run Staging Release Gate'],
    ['rollback-staging-alias', 'Restore exact staging alias preimage'],
  ]);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const pins = job.steps.filter(step => step.run?.includes('pin-staging-dns.mjs'));
    if (!targets.has(name)) {
      assert.deepEqual(pins, [], name);
      continue;
    }
    assert.equal(job['runs-on'], 'ubuntu-latest');
    assert.deepEqual(pins, [
      {
        name: 'Pin staging DNS (temporary NS workaround)',
        run: 'node scripts/ci/pin-staging-dns.mjs',
      },
    ]);
    const index = job.steps.indexOf(pins[0]);
    assert.equal(job.steps[index - 1].uses, './.github/actions/setup');
    assert.ok(index < job.steps.indexOf(findStep(job.steps, targets.get(name))));
  }
  const source = fs.readFileSync(path.join(rootDir, '.github/workflows/cd.yml'), 'utf8');
  const comment = '# Temporary: remove once interdomestik.com NS no longer CNAME (owner DNS fix)';
  assert.equal(source.split(comment).length - 1, targets.size);
  for (const file of fs.readdirSync(path.join(rootDir, '.github/workflows'))) {
    if (file === 'cd.yml' || !/\.ya?ml$/u.test(file)) continue;
    const other = fs.readFileSync(path.join(rootDir, '.github/workflows', file), 'utf8');
    assert.doesNotMatch(other, /pin-staging-dns\.mjs/u, file);
  }
});
