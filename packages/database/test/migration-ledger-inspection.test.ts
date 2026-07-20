import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  startLedgerHarness,
  type LedgerHarness,
  type LedgerSetup,
} from './migration-ledger-inspection.support';

let harness: LedgerHarness;
before(async () => {
  harness = await startLedgerHarness();
});
after(async () => {
  const receipt = await harness.close();
  assert(receipt.removedAt);
});
const code = (result: Awaited<ReturnType<typeof harness.run>>, message?: string) => {
  assert(result.inspection && !result.inspection.ok, message);
  return result.inspection.error.code;
};
const tableChange = (statement: string) => async () => {
  await harness.reset('table');
  await harness.execute(statement);
};

test('inspects every positive live ledger state without changing the database', async () => {
  const cases: readonly Readonly<{
    setup: LedgerSetup;
    applied: number;
    ledgerState: 'schema_absent' | 'table_absent' | 'exact_prefix' | 'all_applied';
  }>[] = [
    { setup: 'schema_absent', applied: 0, ledgerState: 'schema_absent' },
    { setup: 'table_absent', applied: 0, ledgerState: 'table_absent' },
    { setup: 'table', applied: 0, ledgerState: 'exact_prefix' },
    { setup: 'table', applied: 1, ledgerState: 'exact_prefix' },
    { setup: 'table', applied: 92, ledgerState: 'exact_prefix' },
    { setup: 'table', applied: 93, ledgerState: 'all_applied' },
  ];
  for (const item of cases) {
    await harness.reset(item.setup);
    if (item.setup === 'table') await harness.fill(item.applied);
    const beforeState = await harness.snapshot();
    const { outer, inspection } = await harness.run();
    assert.equal(outer.ok, true);
    assert.deepEqual(inspection, {
      ok: true,
      summary: {
        contract_version: 'canonical_migration_ledger_inspection_v1',
        ledger_state: item.ledgerState,
        applied_migrations: item.applied,
        pending_migrations: 93 - item.applied,
        callback_plan_sha256: harness.state.callbackPlanSha256,
        read_only: true,
        execution_authorized: false,
      },
    });
    assert(Object.isFrozen(inspection));
    assert(inspection?.ok && Object.isFrozen(inspection.summary));
    assert.deepEqual(await harness.snapshot(), beforeState);
  }
});

test('rejects live ACL, shape, overflow and non-prefix states', async () => {
  // prettier-ignore
  const cases: readonly [string, () => Promise<void>][] = [
    ['MIGRATION_LEDGER_ACL_REJECTED', async () => { await harness.reset('table_absent'); await harness.execute(`GRANT CREATE ON SCHEMA drizzle TO ${harness.nonowner}`); }],
    ['MIGRATION_LEDGER_ACL_REJECTED', tableChange(`GRANT INSERT ON drizzle.__drizzle_migrations TO ${harness.nonowner}`)],
    ['MIGRATION_LEDGER_ACL_REJECTED', tableChange(`GRANT USAGE ON SEQUENCE drizzle.__drizzle_migrations_id_seq TO ${harness.nonowner}`)],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN extra text')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('CREATE INDEX extra_index ON drizzle.__drizzle_migrations (hash)')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('ALTER TABLE drizzle.__drizzle_migrations ENABLE ROW LEVEL SECURITY')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('ALTER TABLE drizzle.__drizzle_migrations ALTER COLUMN hash DROP NOT NULL')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('ALTER TABLE drizzle.__drizzle_migrations ALTER COLUMN id DROP DEFAULT')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY NONE')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('CREATE RULE extra_rule AS ON UPDATE TO drizzle.__drizzle_migrations DO INSTEAD NOTHING')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', tableChange('CREATE TRIGGER extra_trigger BEFORE UPDATE ON drizzle.__drizzle_migrations FOR EACH ROW EXECUTE FUNCTION pg_catalog.suppress_redundant_updates_trigger()')],
    ['MIGRATION_LEDGER_SHAPE_REJECTED', async () => { await harness.reset('table_absent'); await harness.execute('CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq'); }],
    ['MIGRATION_LEDGER_PREFIX_REJECTED', async () => { await harness.reset('table'); await harness.fill(94); }],
    ['MIGRATION_LEDGER_PREFIX_REJECTED', async () => { await harness.reset('table'); await harness.fill(1); await harness.execute(`UPDATE drizzle.__drizzle_migrations SET hash = '${'f'.repeat(64)}'`); }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [expected, arrange] = cases[index];
    await arrange();
    const message = `fault matrix index ${index}`;
    assert.equal(code(await harness.run(), message), expected, message);
  }
});

test('bounds advisory-lock contention and rejects foreign ownership', async () => {
  await harness.reset('table');
  await harness.setup`BEGIN`;
  await harness.setup`SELECT pg_advisory_xact_lock(673167055, -773281837)`;
  try {
    assert.equal(code(await harness.run()), 'MIGRATION_LEDGER_LOCK_TIMEOUT');
    const controller = new AbortController();
    const pending = harness.run(harness.capability, controller.signal);
    setTimeout(() => controller.abort(), 25);
    const aborted = await pending;
    assert(!aborted.outer.ok);
    if (!aborted.outer.ok) assert.equal(aborted.outer.error.code, 'ADMIN_DB_PREFLIGHT_ABORTED');
    await harness.fixture.waitForNoSession();
  } finally {
    await harness.setup`ROLLBACK`;
  }
  await harness.arrangeForeignOwner();
  assert.equal(code(await harness.run()), 'MIGRATION_LEDGER_OWNER_REJECTED');
});
