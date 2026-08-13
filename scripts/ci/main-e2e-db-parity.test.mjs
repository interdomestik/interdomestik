import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const workflow = yaml.load(fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8'));

test('main E2E uses the Postgres 16 database prepared by its CI job', () => {
  const e2eJob = workflow.jobs['e2e-gate'];
  const postgres = e2eJob.services.postgres;
  const prepare = e2eJob.steps.find(step => step?.name === 'Prepare E2E Database');
  const suite = e2eJob.steps.find(step => step?.name === 'E2E Gate Suite');

  assert.equal(postgres.image, 'postgres:16');
  assert.equal(postgres.env.POSTGRES_USER, 'postgres');
  assert.equal(postgres.env.POSTGRES_DB, 'interdomestik_test');
  assert.deepEqual(postgres.ports, ['5432:5432']);
  assert.equal(
    workflow.env.DATABASE_URL,
    "${{ secrets.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test' }}"
  );

  assert.ok(prepare);
  assert.equal(prepare.env?.DATABASE_URL, undefined);
  assert.equal(prepare.env?.E2E_DATABASE_URL, undefined);
  assert.equal(prepare.env?.E2E_DATABASE_URL_RLS, undefined);
  assert.doesNotMatch(prepare.run, /\b(?:DATABASE_URL|E2E_DATABASE_URL(?:_RLS)?)=/u);

  assert.ok(suite);
  assert.equal(suite.env?.E2E_DATABASE_URL, '${{ env.DATABASE_URL }}');
  assert.equal(suite.env?.E2E_DATABASE_URL_RLS, '${{ env.DATABASE_URL }}');
});
