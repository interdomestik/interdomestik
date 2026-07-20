import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOwnedMigrationCallbackPlan } from '../src/migration-callback-plan-builder';
import {
  callbackCode,
  canonicalReaderResult,
  copyReaderResult,
} from './migration-callback.support';

const READER = 'MIGRATION_CALLBACK_READER_REJECTED';
const PLAN = 'MIGRATION_CALLBACK_PLAN_REJECTED';

test('reader shape, keys, accessors, symbols and primitive types reject', async () => {
  const base = await canonicalReaderResult();
  for (const value of [null, {}, 'value'])
    assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(value)), READER);
  const extra = copyReaderResult(base);
  Object.assign(extra[0], { extra: true });
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(extra)), READER);
  const accessor = copyReaderResult(base);
  Object.defineProperty(accessor[0], 'hash', { get: () => base[0].hash, enumerable: true });
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(accessor)), READER);
  const symbol = copyReaderResult(base);
  symbol[0][Symbol('hidden')] = true;
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(symbol)), READER);
  const wrongType = copyReaderResult(base);
  (wrongType[0] as { sql: unknown }).sql = [1];
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(wrongType)), READER);
  const decoratedArray = copyReaderResult(base);
  Object.assign(decoratedArray, { extra: true });
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(decoratedArray)), READER);
  const sqlAccessor = copyReaderResult(base);
  Object.defineProperty(sqlAccessor[0].sql, '0', { get: () => base[0].sql[0] });
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(sqlAccessor)), READER);
  const inherited = copyReaderResult(base);
  Object.setPrototypeOf(inherited[0].sql, {
    [Symbol.iterator]() {
      throw new Error('iterator');
    },
  });
  assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(inherited)), READER);
});

test('canonical count, bps, time, hash, chunks, bytes and digest reject drift', async () => {
  const base = await canonicalReaderResult();
  const cases: ReaderCase[] = [
    value => {
      value.pop();
    },
    value => {
      value[0].bps = false;
    },
    value => {
      value[1].folderMillis = value[0].folderMillis;
    },
    value => {
      value[0].hash = '0'.repeat(64);
    },
    value => {
      value[0].sql.pop();
    },
    value => {
      value[0].sql[0] += ' ';
    },
    value => {
      value[0].sql[0] = 'x'.repeat(65_537);
    },
  ];
  for (const mutate of cases) {
    const value = copyReaderResult(base);
    mutate(value);
    assert.equal(await callbackCode(() => buildOwnedMigrationCallbackPlan(value)), PLAN);
  }
});

test('builder owns and deeply freezes the exact current plan', async () => {
  const source = await canonicalReaderResult();
  const plan = buildOwnedMigrationCallbackPlan(source);
  const first = plan.callbackItems[0];
  source[0].sql[0] = 'mutated-after-build';
  assert.equal(plan.callbackItems[0], first);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.migrations));
  assert.ok(Object.isFrozen(plan.migrations[0]));
  assert.ok(Object.isFrozen(plan.migrations[0].sql));
  assert.ok(Object.isFrozen(plan.callbackItems));
  assert.equal(
    plan.callbackPlanSha256,
    'f4486654346a7e7c66a5cdbff57f4611268b1c5144e0ab7cea3ac3a1b7e2ab3f'
  );
});

type ReaderCase = (value: Awaited<ReturnType<typeof canonicalReaderResult>>) => void;
