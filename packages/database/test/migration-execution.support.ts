import assert from 'node:assert/strict';
import postgres from 'postgres';
import { readMigrationCallbackPlanState } from '../src/migration-callback-plan-capability';
import { buildCanonicalMigrationCallbackPlan } from '../src/migration-callback-plan';
import type {
  MigrationExecutionResult,
  MigrationExecutionSql,
} from '../src/migration-execution-contracts';
import { executeMigrationKernel } from '../src/migration-execution-kernel';
import { authenticCorpus } from './migration-callback.support';
import { startAdminFixture, type FixtureReceipt } from './admin-connection-preflight.support';
export type MigrationExecutionHarness = Awaited<ReturnType<typeof startMigrationExecutionHarness>>;
export type MigrationExecutionSetup = 'schema_absent' | 'table_absent' | 'table';
export type MigrationRunOptions = Readonly<{
  capability?: unknown;
  signal?: AbortSignal;
  failCallbackAt?: number;
  failUnlock?: boolean;
  onUnlock?: () => void;
  finalPid?: number;
  taggedQueries?: string[];
}>;
function instrument(
  sql: MigrationExecutionSql,
  options: MigrationRunOptions,
  failed: (index: number) => void
): MigrationExecutionSql {
  let callbacks = 0;
  return new Proxy(sql, {
    apply(target, _this, args) {
      const query = (args[0] as TemplateStringsArray).join(' ');
      options.taggedQueries?.push(query);
      if (query.includes('pg_advisory_unlock')) {
        options.onUnlock?.();
        if (options.failUnlock) throw new Error('INJECTED_UNLOCK_FAILURE');
      }
      if (
        options.finalPid !== undefined &&
        query.trim() === 'SELECT pg_catalog.pg_backend_pid()::int AS pid'
      )
        return Promise.resolve([{ pid: options.finalPid }]);
      return Reflect.apply(target, target, args);
    },
    get(target, property, receiver) {
      if (property !== 'unsafe') return Reflect.get(target, property, receiver);
      return (...args: unknown[]) => {
        const index = callbacks++;
        if (index === options.failCallbackAt) throw new Error('INJECTED_CALLBACK_FAILURE');
        const result = Reflect.apply(
          target.unsafe as unknown as (...items: unknown[]) => unknown,
          target,
          args
        );
        return Promise.resolve(result).catch(error => {
          failed(index);
          throw error;
        });
      };
    },
  }) as MigrationExecutionSql;
}

export async function startMigrationExecutionHarness() {
  const fixture = await startAdminFixture();
  const setup = postgres(fixture.ownerEnv.DATABASE_URL, { max: 1, onnotice: () => {} });
  const plan = await buildCanonicalMigrationCallbackPlan(await authenticCorpus());
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error('CANONICAL_CALLBACK_PLAN_UNAVAILABLE');
  const capability = plan.capability;
  const state = readMigrationCallbackPlanState(capability);
  assert.ok(state);
  const owner = new URL(fixture.ownerEnv.DATABASE_URL).username;
  const nonowner = new URL(fixture.nonownerEnv.DATABASE_URL).username;
  const reset = async (kind: MigrationExecutionSetup): Promise<void> => {
    await setup.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await setup.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await setup.unsafe(`CREATE SCHEMA public AUTHORIZATION ${owner}`);
    await setup.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await setup.unsafe(`REVOKE CREATE ON SCHEMA public FROM ${nonowner}`);
    if (kind === 'schema_absent') return;
    await setup.unsafe('CREATE SCHEMA drizzle');
    if (kind === 'table_absent') return;
    await setup.unsafe(`CREATE TABLE drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
    )`);
  };
  const fill = async (length: number): Promise<void> => {
    for (let index = 0; index < length; index += 1) {
      const end = state.entryOffsets[index + 1] ?? state.callbackItems.length;
      for (const item of state.callbackItems.slice(state.entryOffsets[index], end))
        await setup.unsafe(item);
    }
  };
  const snapshot = async () => {
    const catalog = await setup<{ schema_exists: boolean; table_exists: boolean }[]>`
      SELECT to_regnamespace('drizzle') IS NOT NULL AS schema_exists,
        to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS table_exists
    `;
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
  const run = async (options: MigrationRunOptions = {}) => {
    const { withPreflightedAdminConnection } = await import('../src/admin-connection-preflight');
    const signal = options.signal ?? new AbortController().signal;
    let execution: MigrationExecutionResult | undefined;
    let callbackFailureIndex: number | undefined;
    const outer = await withPreflightedAdminConnection(
      fixture.ownerEnv,
      Date.now(),
      signal,
      fixture.authority,
      async (reserved, sameSignal) => {
        execution = await executeMigrationKernel(
          options.capability ?? capability,
          instrument(reserved, options, index => {
            callbackFailureIndex = index;
          }),
          sameSignal
        );
      }
    );
    return Object.freeze({ outer, execution, callbackFailureIndex });
  };
  const close = async (): Promise<FixtureReceipt> => {
    let setupError: unknown;
    try {
      await setup.end({ timeout: 1 });
    } catch (error) {
      setupError = error;
    }
    const receipt = await fixture.stop();
    if (setupError) throw setupError;
    return receipt;
  };
  // prettier-ignore
  return Object.freeze({ capability, state, fixture, setup, reset, fill, snapshot, run, owner, nonowner, close });
}
