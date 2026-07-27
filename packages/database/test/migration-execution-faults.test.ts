import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, test } from 'node:test';
import { inspect } from 'node:util';

import type { MigrationCallbackPlanCapability } from '../src/migration-callback-plan-capability';
import { buildCanonicalMigrationCallbackPlan } from '../src/migration-callback-plan';
import type {
  MigrationExecutionErrorCode,
  MigrationExecutionSql,
} from '../src/migration-execution-contracts';
import { executeMigrationKernel } from '../src/migration-execution-kernel';
import { authenticCorpus } from './migration-callback.support';
import { startMigrationExecutionHarness } from './migration-execution.support';

let capability: MigrationCallbackPlanCapability;
// prettier-ignore
before(async () => {
  const plan = await buildCanonicalMigrationCallbackPlan(await authenticCorpus()); assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error('CANONICAL_CALLBACK_PLAN_UNAVAILABLE'); capability = plan.capability;
});
function sqlTag(run: (query: string) => Promise<unknown>): MigrationExecutionSql {
  const sql = ((parts: TemplateStringsArray) => run(parts.join(' '))) as MigrationExecutionSql;
  Object.defineProperty(sql, 'unsafe', { value: (query: string) => run(query) });
  return sql;
}
const shown = (value: unknown) => `${String(value)} ${JSON.stringify(value)} ${inspect(value)}`;
const failure = (code: MigrationExecutionErrorCode) => ({ ok: false, error: { code } });
test('rejects forged capability and pre-abort without issuing SQL', async () => {
  let calls = 0;
  const sql = sqlTag(async () => {
    calls += 1;
    return [];
  });
  const forged = await executeMigrationKernel({}, sql, new AbortController().signal);
  assert.deepEqual(forged, failure('MIGRATION_EXECUTION_PLAN_CAPABILITY_REJECTED'));
  const controller = new AbortController();
  controller.abort();
  const aborted = await executeMigrationKernel(capability, sql, controller.signal);
  assert.deepEqual(aborted, failure('MIGRATION_EXECUTION_ABORTED'));
  assert.equal(calls, 0);
});
test('fails lock contention before BEGIN without an unlock attempt', async () => {
  const queries: string[] = [];
  const result = await executeMigrationKernel(
    capability,
    sqlTag(async query => {
      queries.push(query);
      return [{ locked: false, pid: 41 }];
    }),
    new AbortController().signal
  );
  assert.deepEqual(result, failure('MIGRATION_EXECUTION_LOCK_CONTENDED'));
  assert.equal(queries.length, 1);
  assert.match(queries[0], /pg_try_advisory_lock/);
  assert.doesNotMatch(queries[0], /BEGIN/);
});
for (const abortAfter of ['lock', 'begin'] as const)
  test(`aborts after ${abortAfter} with ordered transaction cleanup`, async () => {
    const controller = new AbortController();
    const queries: string[] = [];
    const result = await executeMigrationKernel(
      capability,
      sqlTag(async query => {
        queries.push(query);
        if (query.includes('pg_try_advisory_lock')) {
          if (abortAfter === 'lock') controller.abort();
          return [{ locked: true, pid: 42 }];
        }
        if (query.includes('BEGIN') && abortAfter === 'begin') controller.abort();
        return query.includes('pg_advisory_unlock') ? [{ unlocked: true, pid: 42 }] : [];
      }),
      controller.signal
    );
    assert.deepEqual(result, failure('MIGRATION_EXECUTION_ABORTED'));
    const rollback = queries.findIndex(query => query.includes('ROLLBACK'));
    const unlock = queries.findIndex(query => query.includes('pg_advisory_unlock'));
    assert.equal(queries.filter(query => query.includes('pg_advisory_unlock')).length, 1);
    if (abortAfter === 'lock') assert.equal(rollback, -1);
    else assert(rollback >= 0 && unlock > rollback);
  });
test('BEGIN failure preserves its code unless fixed unlock cleanup fails', async () => {
  const run = async (unlockFails: boolean) => {
    const queries: string[] = [];
    const result = await executeMigrationKernel(
      capability,
      sqlTag(async query => {
        queries.push(query);
        if (query.includes('pg_try_advisory_lock')) return [{ locked: true, pid: 43 }];
        if (query.includes('BEGIN'))
          throw Object.assign(new Error('BEGIN_SENTINEL'), { code: '57014' });
        if (unlockFails) throw new Error('UNLOCK_SENTINEL');
        return [{ unlocked: true, pid: 43 }];
      }),
      new AbortController().signal
    );
    return { queries, result };
  };
  const timeout = await run(false);
  assert.deepEqual(timeout.result, failure('MIGRATION_EXECUTION_TIMEOUT'));
  assert.equal(timeout.queries.filter(query => query.includes('pg_advisory_unlock')).length, 1);
  assert.doesNotMatch(shown(timeout.result), /BEGIN_SENTINEL/);
  const cleanup = await run(true);
  assert.deepEqual(cleanup.result, failure('MIGRATION_EXECUTION_CLEANUP_FAILED'));
  assert.doesNotMatch(shown(cleanup.result), /BEGIN_SENTINEL|UNLOCK_SENTINEL/);
});

test('preserves cleanup failure when abort lands during post-commit unlock', async () => {
  const harness = await startMigrationExecutionHarness();
  try {
    await harness.reset('table');
    await harness.fill(93);
    const controller = new AbortController();
    const result = await harness.run({
      signal: controller.signal,
      failUnlock: true,
      onUnlock: () => controller.abort(),
    });
    assert.deepEqual(result.execution, failure('MIGRATION_EXECUTION_CLEANUP_FAILED'));
  } finally {
    await harness.close();
  }
});

test('unlocks once for a malformed successful writer-lock response', async () => {
  const queries: string[] = [];
  // prettier-ignore
  const malformed = [{ locked: true, pid: 44 }, { locked: false, pid: 44 }];
  const result = await executeMigrationKernel(
    capability,
    sqlTag(async query => {
      queries.push(query);
      if (query.includes('pg_try_advisory_lock')) return malformed;
      if (query.includes('pg_advisory_unlock')) return [{ unlocked: true, pid: 44 }];
      return [];
    }),
    new AbortController().signal
  );
  assert.deepEqual(result, failure('MIGRATION_EXECUTION_TRANSACTION_FAILED'));
  assert.equal(queries.filter(query => query.includes('pg_advisory_unlock')).length, 1);
  assert(!queries.some(query => query.includes('BEGIN')));
});

test('binds the session lock to the accepted canonical preimage', () => {
  const digest = createHash('sha256')
    .update('interdomestik:migration-ledger-inspection:v1')
    .digest();
  assert.deepEqual([digest.readInt32BE(0), digest.readInt32BE(4)], [673167055, -773281837]);
});
