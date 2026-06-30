import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cdWorkflow = readYaml('.github/workflows/cd.yml');
const deployAction = readYaml('.github/actions/trigger-digest-verified-deploy/action.yml');

function readYaml(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

test('CD build digest outputs remain wired into deploy jobs', () => {
  for (const jobName of ['build-staging', 'build-production']) {
    assert.equal(
      cdWorkflow.jobs[jobName].outputs.image_digest,
      '${{ steps.build.outputs.digest }}'
    );
  }
});

test('Vercel and database credentials stay out of workflow-level env', () => {
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_RLS',
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'VERCEL_TOKEN',
  ]) {
    assert.equal(cdWorkflow.env[key], undefined);
  }
});

test('Vercel deploy action still exports deployment and gate hostnames', () => {
  const deployStep = deployAction.runs.steps.find(step => step?.name === 'Deploy Vercel artifact');

  assert.ok(deployStep);
  assert.match(deployStep.run, /hostname=/u);
  assert.match(deployStep.run, /configure-vercel-gate-url\.mjs/u);
  assert.match(deployStep.run, /GITHUB_OUTPUT/u);
});
