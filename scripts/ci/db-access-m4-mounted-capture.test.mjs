import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mountedLoader, opsRoot, operationId } from './db-access-m4-mounted-relay.test-fixture.mjs';
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('nine-scalar invocation capture preserves true ordinal, nullable exception and exact settlement', async () => {
  const load = mountedLoader(),
    ctx = await load(opsRoot + 'm4-private-runtime-context.ts'),
    database = {},
    verifySession = () => {},
    identity = {},
    data = {},
    configuration = Object.freeze({ database, verifySession });
  const request = Object.freeze({
      version: 1,
      command: 'm4.legacy.assign-claim',
      operationId,
      claimId: 'claim-1',
      staffId: 'staff-1',
    }),
    state = { budget: { used: 0, refused: false }, refused: false, rows: [] };
  const bind = () =>
    ctx.bindM4AssignmentInvocation(
      state,
      'legacy-admin',
      configuration,
      database,
      verifySession,
      identity,
      data,
      request
    );
  const first = bind(),
    second = bind();
  assert.deepEqual(
    state.rows.map(r => r.ordinal),
    [1, 2]
  );
  assert(state.rows.every(r => r.responseDigest === null));
  const a = {
      status: 'completed',
      operationId,
      replayed: false,
      result: { success: true },
      changed: true,
    },
    b = { status: 'denied', reason: 'UNAUTHORIZED' };
  assert.equal(second(b), b);
  assert.equal(first(a), a);
  assert.equal(state.rows[0].responseDigest, sha(a));
  assert.equal(state.rows[1].responseDigest, sha(b));
  assert(state.rows.every(r => r.requestDigest === sha(request)));
  const exception = bind();
  void exception;
  assert.equal(state.rows[2].responseDigest, null);
  assert(Object.isFrozen(state.rows[2]));
  assert.equal(Object.keys(state.rows[2]).length, 9);
  assert.equal(JSON.stringify(state.rows).includes('database'), false);
  assert.throws(() => first(a), /settlement/);
  assert.equal(state.refused, true);
  const wrong = { budget: { used: 0, refused: false }, refused: false, rows: [] };
  assert.throws(
    () =>
      ctx.bindM4AssignmentInvocation(
        wrong,
        'legacy-admin',
        Object.freeze({ database: {}, verifySession }),
        database,
        verifySession,
        identity,
        data,
        request
      ),
    /configuration/
  );
  assert.equal(wrong.rows.length, 0);
  assert.equal(wrong.refused, true);
  const replaced = { budget: { used: 0, refused: false }, refused: false, rows: [] };
  const settle = ctx.bindM4AssignmentInvocation(
    replaced,
    'legacy-admin',
    configuration,
    database,
    verifySession,
    identity,
    data,
    request
  );
  replaced.rows[0] = { ...replaced.rows[0] };
  assert.throws(() => settle(a), /settlement/);
  const shared = { used: 2047, refused: false },
    last = { budget: shared, refused: false, rows: [] },
    foreign = { budget: shared, refused: false, rows: [] };
  const pending = ctx.bindM4AssignmentInvocation(
    last,
    'legacy-admin',
    configuration,
    database,
    verifySession,
    identity,
    data,
    request
  );
  void pending;
  assert.equal(shared.used, 2048);
  assert.equal(last.rows.length, 1);
  assert.throws(
    () =>
      ctx.bindM4AssignmentInvocation(
        foreign,
        'legacy-admin',
        configuration,
        database,
        verifySession,
        identity,
        data,
        request
      ),
    /bound|configuration/
  );
  assert.equal(shared.refused, true);
  assert.equal(foreign.rows.length, 0);
  assert.equal(last.rows[0].ordinal, 1);
  assert.equal(last.rows[0].responseDigest, null);
  assert.throws(
    () =>
      ctx.readM4ClosedAssignmentContexts({
        closed: () => true,
        active: () => 0,
        refused: () => last.refused || shared.refused,
        captures: last.rows,
      }),
    /closed/
  );
});
