import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cd = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/cd.yml'), 'utf8'));
const step = (job, name) => job.steps.find(candidate => candidate.name === name);

test('forces IPv4 DNS only across staging deploy and rollback execution', () => {
  const stagingDeploy = step(cd.jobs['deploy-staging'], 'Deploy Staging to Vercel');
  const stagingRollback = step(
    cd.jobs['rollback-staging-alias'],
    'Restore exact staging alias preimage'
  );
  const productionDeploy = step(cd.jobs['deploy-production'], 'Deploy Production to Vercel');
  const preload = '--import=${{ github.workspace }}/scripts/ci/cd-runner-preflight.mjs';
  assert.deepEqual(
    [
      cd.jobs['deploy-staging'].env.INTERDOMESTIK_VERCEL_IPV4_ONLY,
      stagingDeploy.env.INTERDOMESTIK_VERCEL_IPV4_ONLY,
      stagingDeploy.env.NODE_OPTIONS,
      stagingRollback.env.INTERDOMESTIK_VERCEL_IPV4_ONLY,
      stagingRollback.env.NODE_OPTIONS,
      productionDeploy.env?.INTERDOMESTIK_VERCEL_IPV4_ONLY,
      productionDeploy.env?.NODE_OPTIONS,
    ],
    ['1', '1', preload, '1', preload, undefined, undefined]
  );
});
