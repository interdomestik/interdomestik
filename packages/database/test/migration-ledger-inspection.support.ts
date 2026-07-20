import assert from 'node:assert/strict';
import postgres from 'postgres';

import { readMigrationCallbackPlanState } from '../src/migration-callback-plan-capability';
import { buildCanonicalMigrationCallbackPlan } from '../src/migration-callback-plan';
import type { MigrationLedgerResult } from '../src/migration-ledger-contracts';
import { inspectMigrationLedger } from '../src/migration-ledger-inspection';
import { authenticCorpus } from './migration-callback.support';
import {
  startAdminFixture,
  type AdminFixture,
  type FixtureReceipt,
} from './admin-connection-preflight.support';

export type LedgerHarness = Awaited<ReturnType<typeof startLedgerHarness>>;
export type LedgerSetup = 'schema_absent' | 'table_absent' | 'table';

export async function startLedgerHarness() {
  const fixture = await startAdminFixture();
  const setup = postgres(fixture.ownerEnv.DATABASE_URL, { max: 1, onnotice: () => {} });
  const corpus = await authenticCorpus();
  const plan = await buildCanonicalMigrationCallbackPlan(corpus);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error('CANONICAL_CALLBACK_PLAN_UNAVAILABLE');
  const capability = plan.capability;
  const state = readMigrationCallbackPlanState(capability);
  assert.ok(state);
  let setupClosed = false;

  const reset = async (kind: LedgerSetup): Promise<void> => {
    await setup.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    if (kind === 'schema_absent') return;
    await setup.unsafe('CREATE SCHEMA drizzle');
    if (kind === 'table_absent') return;
    await setup.unsafe(`CREATE TABLE drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
    )`);
  };
  const fill = async (length: number): Promise<void> => {
    for (let index = 0; index < length; index += 1) {
      const migration = state.migrations[index] ?? state.migrations[0];
      await setup`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${migration.hash}, ${migration.folderMillis})
      `;
    }
  };
  const snapshot = async () => {
    const catalog = await setup<
      { schema_exists: boolean; table_exists: boolean }[]
    >`SELECT to_regnamespace('drizzle') IS NOT NULL AS schema_exists,
             to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS table_exists`;
    const tableExists = catalog[0]?.table_exists ?? false;
    const ledgerRows = tableExists
      ? ((
          await setup<{ count: number }[]>`
          SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
        `
        )[0]?.count ?? 0)
      : 0;
    return Object.freeze({
      schemaExists: catalog[0]?.schema_exists ?? false,
      tableExists,
      ledgerRows,
    });
  };
  const run = async (
    value: unknown = capability,
    signal: AbortSignal = new AbortController().signal
  ) => {
    const { withPreflightedAdminConnection } = await import('../src/admin-connection-preflight');
    let inspection: MigrationLedgerResult | undefined;
    const outer = await withPreflightedAdminConnection(
      fixture.ownerEnv,
      Date.now(),
      signal,
      fixture.authority,
      async (reserved, sameSignal) => {
        inspection = await inspectMigrationLedger(value, reserved, sameSignal);
      }
    );
    return Object.freeze({ outer, inspection });
  };
  const execute = (statement: string) => setup.unsafe(statement);
  const username = (target: AdminFixture['ownerEnv']) => new URL(target.DATABASE_URL).username;
  const arrangeForeignOwner = async (): Promise<void> => {
    await reset('schema_absent');
    const target = new URL(fixture.nonownerEnv.DATABASE_URL);
    await setup.unsafe(
      `GRANT CREATE ON DATABASE ${target.pathname.slice(1)} TO ${target.username}`
    );
    await setup.end({ timeout: 1 });
    setupClosed = true;
    const foreign = postgres(fixture.nonownerEnv.DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      await foreign.unsafe('CREATE SCHEMA drizzle');
    } finally {
      await foreign.end({ timeout: 1 });
    }
  };
  const close = async (): Promise<FixtureReceipt> => {
    let setupError: unknown;
    try {
      if (!setupClosed) await setup.end({ timeout: 1 });
    } catch (error) {
      setupError = error;
    }
    const receipt = await fixture.stop();
    if (setupError) throw setupError;
    return receipt;
  };
  return Object.freeze({
    capability,
    state,
    fixture,
    setup,
    reset,
    fill,
    snapshot,
    run,
    execute,
    owner: username(fixture.ownerEnv),
    nonowner: username(fixture.nonownerEnv),
    arrangeForeignOwner,
    close,
  });
}
