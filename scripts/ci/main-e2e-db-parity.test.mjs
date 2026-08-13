import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

test('main E2E gate uses the database prepared by its Postgres service', () => {
  const workflow = yaml.load(
    fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8')
  );
  const gate = workflow.jobs['e2e-gate'];
  const prepare = gate.steps.find(step => step?.name === 'Prepare E2E Database');
  const suite = gate.steps.find(step => step?.name === 'E2E Gate Suite');

  assert.ok(prepare);
  assert.ok(suite);
  assert.equal(gate.services.postgres.env.POSTGRES_DB, 'interdomestik_test');
  assert.equal(gate.services.postgres.ports[0], '5432:5432');
  assert.equal(
    workflow.env.DATABASE_URL,
    "${{ secrets.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test' }}"
  );
  assert.deepEqual(suite.env, {
    E2E_DATABASE_URL: '${{ env.DATABASE_URL }}',
    E2E_DATABASE_URL_RLS: '${{ env.DATABASE_URL }}',
  });
  assert.equal(prepare.env, undefined);
});
