import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  startMigrationExecutionHarness,
  type MigrationExecutionHarness,
} from './migration-execution.support';

let harness: MigrationExecutionHarness;
before(async () => {
  harness = await startMigrationExecutionHarness();
});
after(async () => {
  const receipt = await harness.close();
  assert(receipt.removedAt);
});

test('schema_absent commits the exact plan once or rolls every mutation back', async () => {
  await harness.reset('schema_absent');
  const committed = await harness.run();
  assert.equal(committed.outer.ok, true);
  assert.equal(committed.execution?.ok, true, `callback ${committed.callbackFailureIndex}`);
  assert.deepEqual(committed.execution, {
    ok: true,
    summary: {
      contract_version: 'canonical_migration_execution_v1',
      callback_plan_sha256: harness.state.callbackPlanSha256,
      applied_before: 0,
      applied_now: 93,
      applied_total: 93,
      session_reserved: true,
      transaction_committed: true,
      session_lock_released: true,
      execution_completed: true,
    },
  });
  assert.deepEqual(await harness.snapshot(), {
    schemaExists: true,
    tableExists: true,
    ledgerRows: 93,
  });

  await harness.reset('schema_absent');
  const rejected = await harness.run({ failCallbackAt: 0 });
  assert.equal(rejected.outer.ok, true);
  assert.deepEqual(rejected.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_CALLBACK_FAILED' },
  });
  assert.deepEqual(await harness.snapshot(), {
    schemaExists: false,
    tableExists: false,
    ledgerRows: 0,
  });
});

test('executes only the exact pending suffix and is idempotent at all_applied', async () => {
  const cases = [
    { setup: 'table_absent' as const, applied: 0 },
    { setup: 'table' as const, applied: 1 },
    { setup: 'table' as const, applied: 92 },
    { setup: 'table' as const, applied: 93 },
  ];
  for (const item of cases) {
    await harness.reset(item.setup);
    if (item.setup === 'table') await harness.fill(item.applied);
    const result = await harness.run();
    assert.equal(result.outer.ok, true);
    assert(result.execution?.ok);
    assert.equal(result.execution.summary.applied_before, item.applied);
    assert.equal(result.execution.summary.applied_now, 93 - item.applied);
    assert.equal(result.execution.summary.applied_total, 93);
    assert.deepEqual(await harness.snapshot(), {
      schemaExists: true,
      tableExists: true,
      ledgerRows: 93,
    });
    const again = await harness.run();
    assert(again.execution?.ok);
    assert.equal(again.execution.summary.applied_before, 93);
    assert.equal(again.execution.summary.applied_now, 0);
  }
});

test('rejects unsafe public, ledger shape and prefix state before callbacks', async () => {
  await harness.reset('schema_absent');
  await harness.setup.unsafe(`GRANT CREATE ON SCHEMA public TO ${harness.nonowner}`);
  const publicAcl = await harness.run();
  assert.deepEqual(publicAcl.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED' },
  });

  await harness.reset('table');
  await harness.setup.unsafe('ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN extra text');
  const shape = await harness.run();
  assert.deepEqual(shape.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_LEDGER_SHAPE_REJECTED' },
  });

  await harness.reset('table');
  await harness.fill(1);
  await harness.setup.unsafe(`UPDATE drizzle.__drizzle_migrations SET hash = '${'f'.repeat(64)}'`);
  const prefix = await harness.run();
  assert.deepEqual(prefix.execution, {
    ok: false,
    error: { code: 'MIGRATION_EXECUTION_LEDGER_PREFIX_REJECTED' },
  });
});

test('fails immediately while the fixed session lock is held elsewhere', async () => {
  await harness.reset('schema_absent');
  await harness.setup`SELECT pg_advisory_lock(673167055, -773281837)`;
  try {
    const result = await harness.run();
    assert.deepEqual(result.execution, {
      ok: false,
      error: { code: 'MIGRATION_EXECUTION_LOCK_CONTENDED' },
    });
    assert.deepEqual(await harness.snapshot(), {
      schemaExists: false,
      tableExists: false,
      ledgerRows: 0,
    });
  } finally {
    await harness.setup`SELECT pg_advisory_unlock(673167055, -773281837)`;
  }
});
