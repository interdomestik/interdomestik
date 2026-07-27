import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, test } from 'node:test';
import { inspect } from 'node:util';

import type { MigrationCallbackPlanCapability } from '../src/migration-callback-plan-capability';
import { buildCanonicalMigrationCallbackPlan } from '../src/migration-callback-plan';
import type { LedgerSql } from '../src/migration-ledger-contracts';
import { inspectMigrationLedger } from '../src/migration-ledger-inspection';
import { authenticCorpus } from './migration-callback.support';

let capability: MigrationCallbackPlanCapability;
before(async () => {
  const result = await buildCanonicalMigrationCallbackPlan(await authenticCorpus());
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('CANONICAL_CALLBACK_PLAN_UNAVAILABLE');
  capability = result.capability;
});
const tag = (run: (query: string) => Promise<unknown>) =>
  ((parts: TemplateStringsArray) => run(parts.join(' '))) as unknown as LedgerSql;

test('rejects a forged plan and pre-abort before issuing SQL', async () => {
  let calls = 0;
  const sql = tag(async () => {
    calls += 1;
    return [];
  });
  const forged = await inspectMigrationLedger({}, sql, new AbortController().signal);
  assert.deepEqual(forged, {
    ok: false,
    error: { code: 'MIGRATION_LEDGER_PLAN_CAPABILITY_REJECTED' },
  });
  const controller = new AbortController();
  controller.abort();
  const aborted = await inspectMigrationLedger(capability, sql, controller.signal);
  assert.deepEqual(aborted, { ok: false, error: { code: 'MIGRATION_LEDGER_ABORTED' } });
  assert.equal(calls, 0);
});

test('maps abort and rollback failure without leaking sentinels', async () => {
  const controller = new AbortController();
  let rejectBegin!: (reason: unknown) => void;
  const pending = new Promise((_resolve, reject) => {
    rejectBegin = reject;
  });
  const abortSql = tag(query => (query.includes('BEGIN') ? pending : Promise.resolve([])));
  const task = inspectMigrationLedger(capability, abortSql, controller.signal);
  controller.abort();
  rejectBegin(new Error('ABORT_SENTINEL'));
  assert.deepEqual(await task, { ok: false, error: { code: 'MIGRATION_LEDGER_ABORTED' } });

  const cleanupSql = tag(async query => {
    if (query.includes('ROLLBACK')) throw new Error('CLEANUP_SENTINEL');
    if (query.includes('FROM pg_catalog.pg_namespace')) throw new Error('PRIMARY_SENTINEL');
    if (query.includes('pg_backend_pid')) return [{ pid: 1 }];
    return [];
  });
  const result = await inspectMigrationLedger(capability, cleanupSql, new AbortController().signal);
  assert.deepEqual(result, { ok: false, error: { code: 'MIGRATION_LEDGER_CLEANUP_FAILED' } });
  const shown = `${JSON.stringify(result)} ${inspect(result)} ${String(result)}`;
  assert.doesNotMatch(shown, /PRIMARY_SENTINEL|CLEANUP_SENTINEL/);
});

test('rolls back before one shared unlock when abort lands after acquisition', async () => {
  const controller = new AbortController();
  const queries: string[] = [];
  const sql = tag(async query => {
    queries.push(query);
    if (query.includes('pg_advisory_lock_shared')) {
      controller.abort();
      return [{ pid: 21 }];
    }
    if (query.includes('pg_advisory_unlock_shared')) return [{ unlocked: true, pid: 21 }];
    return [];
  });
  const result = await inspectMigrationLedger(capability, sql, controller.signal);
  assert.deepEqual(result, { ok: false, error: { code: 'MIGRATION_LEDGER_ABORTED' } });
  const rollback = queries.findIndex(query => query.includes('ROLLBACK'));
  const unlock = queries.findIndex(query => query.includes('pg_advisory_unlock_shared'));
  assert(rollback >= 0 && unlock > rollback);
  assert.equal(queries.filter(query => query.includes('pg_advisory_unlock_shared')).length, 1);
  assert.equal(
    queries.some(query => query.includes('ISOLATION LEVEL')),
    false
  );
});

test('maps shared-lock timeout after rollback without an unlock attempt', async () => {
  const queries: string[] = [];
  const sql = tag(async query => {
    queries.push(query);
    if (query.includes('pg_advisory_lock_shared'))
      throw Object.assign(new Error('LOCK_SENTINEL'), { code: '55P03' });
    return [];
  });
  const result = await inspectMigrationLedger(capability, sql, new AbortController().signal);
  assert.deepEqual(result, { ok: false, error: { code: 'MIGRATION_LEDGER_LOCK_TIMEOUT' } });
  assert.equal(queries.filter(query => query.includes('ROLLBACK')).length, 1);
  assert.equal(
    queries.some(query => query.includes('pg_advisory_unlock_shared')),
    false
  );
});

test('unlocks one malformed successful shared-lock response', async () => {
  const queries: string[] = [];
  const sql = tag(async query => {
    queries.push(query);
    if (query.includes('pg_advisory_lock_shared')) return [{ pid: 22 }, { pid: 22 }];
    if (query.includes('pg_advisory_unlock_shared')) return [{ unlocked: true, pid: 22 }];
    return [];
  });
  const result = await inspectMigrationLedger(capability, sql, new AbortController().signal);
  assert.deepEqual(result, { ok: false, error: { code: 'MIGRATION_LEDGER_TRANSACTION_FAILED' } });
  const rollback = queries.findIndex(query => query.includes('ROLLBACK'));
  const unlock = queries.findIndex(query => query.includes('pg_advisory_unlock_shared'));
  assert(rollback >= 0 && unlock > rollback);
  assert.equal(queries.filter(query => query.includes('pg_advisory_unlock_shared')).length, 1);
});

test('binds the fixed lock integers to the accepted canonical preimage', () => {
  const digest = createHash('sha256')
    .update('interdomestik:migration-ledger-inspection:v1')
    .digest();
  assert.deepEqual([digest.readInt32BE(0), digest.readInt32BE(4)], [673167055, -773281837]);
});
