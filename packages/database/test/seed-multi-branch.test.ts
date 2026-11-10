import assert from 'node:assert/strict';
import test from 'node:test';
import { sql } from 'drizzle-orm';
import * as schema from '../src/schema';
import { buildMultiBranchSettingsToSeed, seedTenants } from '../src/seed-golden/tenants-branches';
import { assertUpsertedOnEachRun, createUpsertCaptureDb } from './seed-upsert-capture.support';

test('golden/E2E KS, MK and pilot tenants explicitly retain multi-branch regression coverage', async t => {
  const rows = buildMultiBranchSettingsToSeed();
  assert.deepEqual(
    rows.map(row => row.tenantId),
    ['tenant_ks', 'tenant_mk', 'pilot-mk']
  );
  for (const row of rows) {
    assert.equal(row.category, 'branches');
    assert.equal(row.key, 'multi_branch');
    assert.deepEqual(row.value, { enabled: true });
  }
  const capture = createUpsertCaptureDb();
  const db = capture.db as Parameters<typeof seedTenants>[0]['db'];
  t.mock.method(console, 'log', () => {});
  for (let run = 0; run < 2; run++) await seedTenants({ db, schema, sql, at: () => new Date(0) });
  assertUpsertedOnEachRun(capture.writes, rows, 2);
});
