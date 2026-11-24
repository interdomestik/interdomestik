import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { repoRoot } from './inventory.mjs';

test('only the advisory job invokes the database inventory and runner', () => {
  const { jobs } = yaml.load(readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8'));
  const advisory = 'database-lanes-advisory';
  const job = jobs[advisory];
  assert.equal(job['continue-on-error'], true);
  assert.deepEqual(job.services, jobs['e2e-gate'].services);
  assert.equal(job.env.DATABASE_URL, jobs['e2e-gate'].env.DATABASE_URL);
  const runs = job.steps.map(step => step.run).filter(Boolean);
  assert.deepEqual(runs, [
    'node --test scripts/ci/db-lanes/*.test.mjs',
    'node scripts/ci/db-lanes/inventory.mjs',
    'node scripts/ci/db-lanes/run.mjs unit',
    'pnpm db:migrate',
    'node scripts/ci/db-lanes/run.mjs pg16',
  ]);
  for (const [name, existing] of Object.entries(jobs)) {
    if (name === advisory) continue;
    assert.ok(![existing.needs].flat().includes(advisory), name);
    assert.ok(
      existing.steps.every(step => !step.run?.includes('scripts/ci/db-lanes/')),
      name
    );
  }
});
