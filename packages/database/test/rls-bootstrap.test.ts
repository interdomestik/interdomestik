import assert from 'node:assert/strict';
import test from 'node:test';

import { createRlsRoleReadiness, RlsRoleReadinessPendingError } from '../src/rls-role-readiness';
import type { RlsConnectionRolePosture } from '../src/rls-role-assertion';

const safe: RlsConnectionRolePosture[] = [
  { currentUser: 'synthetic_rls', roleBypassesRls: false, roleIsSuperuser: false },
];
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('construction is inert; explicit initialization coalesces and pending denies access', async () => {
  let queries = 0;
  let settle!: (rows: RlsConnectionRolePosture[]) => void;
  const result = new Promise<RlsConnectionRolePosture[]>(resolve => {
    settle = resolve;
  });
  const readiness = createRlsRoleReadiness({
    enabled: true,
    initialFailure: null,
    timeoutMs: 5_000,
    queryRolePosture: async () => {
      queries++;
      return result;
    },
  });
  assert.equal(queries, 0);
  assert.deepEqual(readiness.snapshot(), { phase: 'idle' });
  assert.throws(readiness.assertClientReady, RlsRoleReadinessPendingError);
  const requests = Array.from({ length: 8 }, () => readiness.assertReady());
  assert.equal(queries, 1);
  assert.deepEqual(readiness.snapshot(), { phase: 'pending' });
  assert.throws(readiness.assertClientReady, RlsRoleReadinessPendingError);
  settle(safe);
  await Promise.all(requests);
  assert.doesNotThrow(readiness.assertClientReady);
  const snapshot = readiness.snapshot();
  assert.deepEqual(snapshot, { phase: 'ready' });
  assert(Object.isFrozen(snapshot));
  await readiness.assertReady();
  assert.equal(queries, 1);
});

test('unsafe posture remains denied and snapshot contains no native failure or credentials', async () => {
  let queries = 0;
  const readiness = createRlsRoleReadiness({
    enabled: true,
    initialFailure: null,
    timeoutMs: 5_000,
    queryRolePosture: async () => {
      queries++;
      return [{ ...safe[0], roleIsSuperuser: true }];
    },
  });
  await assert.rejects(readiness.assertReady(), /can bypass row-level security/);
  assert.throws(readiness.assertClientReady, /can bypass row-level security/);
  assert.deepEqual(readiness.snapshot(), {
    phase: 'failed',
    reason: 'role_bypasses_rls',
    checkedRole: 'connection',
    timedOut: false,
  });
  await assert.rejects(readiness.assertReady());
  assert.equal(queries, 1);
});

test('timeout retains unresolved SQL slot; late settlement cannot unlock before qualified recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let settle!: (rows: RlsConnectionRolePosture[]) => void;
  const first = new Promise<RlsConnectionRolePosture[]>(resolve => {
    settle = resolve;
  });
  let queries = 0;
  const readiness = createRlsRoleReadiness({
    enabled: true,
    initialFailure: null,
    timeoutMs: 5_000,
    queryRolePosture: async () => (++queries === 1 ? first : safe),
  });
  const request = assert.rejects(readiness.assertReady(), /could not be verified/);
  t.mock.timers.tick(5_000);
  await request;
  assert.equal(readiness.snapshot().timedOut, true);
  t.mock.timers.tick(30_000);
  await assert.rejects(readiness.assertReady());
  assert.equal(queries, 1);
  settle(safe);
  await flush();
  assert.throws(readiness.assertClientReady);
  await assert.rejects(readiness.assertReady());
  t.mock.timers.tick(5_000);
  await readiness.assertReady();
  assert.equal(queries, 2);
  assert.doesNotThrow(readiness.assertClientReady);
});

test('disabled nonproduction readiness performs no role query', async () => {
  let queries = 0;
  const readiness = createRlsRoleReadiness({
    enabled: false,
    initialFailure: null,
    queryRolePosture: async () => {
      queries++;
      return safe;
    },
  });
  await readiness.assertReady();
  assert.doesNotThrow(readiness.assertClientReady);
  assert.equal(queries, 0);
  assert.deepEqual(readiness.snapshot(), { phase: 'ready' });
});
