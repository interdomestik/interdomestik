import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { repoRoot } from './inventory.mjs';

const workflow = name =>
  yaml.load(readFileSync(join(repoRoot, `.github/workflows/${name}.yml`), 'utf8'));
const ci = workflow('ci');
const lanes = workflow('database-lanes');
const job = lanes.jobs['database-lanes-advisory'];

test('the PR-only workflow keeps database lane execution independent of protected CI', () => {
  assert.deepEqual(Object.keys(lanes.on), ['pull_request']);
  assert.deepEqual(lanes.on.pull_request, ci.on.pull_request);
  assert.deepEqual(lanes.permissions, { contents: 'read' });
  const preflight = lanes.jobs['advisory-validation-surface'];
  assert.equal(preflight.steps[1].uses, './.github/actions/validation-surface');
  assert.equal(preflight.steps[0].with['persist-credentials'], false);
  assert.deepEqual(job.needs, ['advisory-validation-surface']);
  assert.equal(job.if, "needs.advisory-validation-surface.outputs.run_broad == 'true'");
  assert.equal(job['continue-on-error'], true);
  assert.equal(job.steps[0].with['persist-credentials'], false);
  assert.deepEqual(job.services.postgres, {
    ...ci.jobs['e2e-gate'].services.postgres,
    ports: ['127.0.0.1:5432:5432'],
  });
  assert.equal(job.env.DATABASE_URL, ci.jobs['e2e-gate'].env.DATABASE_URL);
  const [contract, inventory, unit, migration, pg16, summary] = job.steps.filter(step => step.run);
  assert.deepEqual(
    [contract.run, inventory.run, unit.run, migration.run],
    [
      'node --test scripts/ci/db-lanes/*.test.mjs',
      'node scripts/ci/db-lanes/inventory.mjs',
      'node scripts/ci/db-lanes/run.mjs unit',
      'pnpm db:migrate',
    ]
  );
  assert.match(pg16.run, /\nnode scripts\/ci\/db-lanes\/run\.mjs pg16\n$/u);
  for (const step of [migration, pg16, summary]) assert.equal(step.if, '${{ !cancelled() }}');
  assert.ok(job.steps.every(step => !Object.hasOwn(step, 'continue-on-error')));
  for (const [name, existing] of Object.entries(ci.jobs)) {
    assert.notEqual(name, 'database-lanes-advisory');
    assert.ok(![existing.needs].flat().includes('database-lanes-advisory'), name);
    assert.ok(
      existing.steps.every(step => !step.run?.includes('scripts/ci/db-lanes/')),
      name
    );
  }
});

test('PG16 refuses to run without a successful journal build', () => {
  const step = job.steps.find(candidate => candidate.id === 'pg16');
  assert.equal(step.env.MIGRATION_OUTCOME, '${{ steps.migration.outcome }}');
  for (const outcome of ['failure', 'skipped', '']) {
    const run = spawnSync('bash', ['-ec', step.run], {
      env: { MIGRATION_OUTCOME: outcome },
      encoding: 'utf8',
    });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /PG16 tests require a successful journal build/u);
  }
});

test('the advisory summary reports each execution and fails on failed or missing lanes', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'db-lane-summary-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const summary = job.steps.at(-1);
  const success = { GITHUB_STEP_SUMMARY: join(scratch, 'summary') };
  for (const id of ['contract', 'inventory', 'unit', 'migration', 'pg16']) {
    const key = `${id.toUpperCase()}_OUTCOME`;
    assert.equal(summary.env[key], `\${{ steps.${id}.outcome }}`);
    success[key] = 'success';
  }
  for (const [changes, status, expected] of [
    [{}, 0, /UNIT: success/u],
    [{ UNIT_OUTCOME: 'failure' }, 1, /UNIT: failure/u],
    [{ PG16_OUTCOME: 'failure' }, 1, /PG16: failure/u],
    [{ PG16_OUTCOME: 'skipped' }, 1, /PG16: skipped/u],
    [{ PG16_OUTCOME: '' }, 1, /PG16: missing/u],
  ]) {
    const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', summary.run], {
      env: { ...success, ...changes },
      encoding: 'utf8',
    });
    assert.equal(run.status, status);
    assert.match(run.stdout, expected);
  }
});
