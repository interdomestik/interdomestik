import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  bootstrap,
  proof,
  runtimeSources,
  mockBootstrap,
  configuration,
  command,
  executeFamily,
} from './db-access-m4-assignment-context.fixture.mjs';

test('actual lexical owner record is closed drained one-use non-secret and common to four branches', async () => {
  const f = mockBootstrap(),
    empty = f.api.createM4LocalQualificationAssignmentRuntime(configuration);
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(empty));
  await empty.close();
  assert.equal(f.api.takeM4OwnedAssignmentContexts(empty).rows.length, 0);
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(empty));
  const { runtime, record } = await executeFamily(f);
  assert.deepEqual(
    record.rows.map(r => r.profile),
    ['ops', 'staff', 'legacy-admin', 'legacy-agent']
  );
  assert(record.rows.every(r => r.configurationIdentityChecked && r.capturedAfterPosture));
  assert(!JSON.stringify(record).includes(configuration.issuerSecret));
  for (const copy of [{ ...runtime }, JSON.parse(JSON.stringify(runtime)), runtime])
    assert.throws(() => f.api.takeM4OwnedAssignmentContexts(copy));
});

test('actual local owner refuses take while closed work is still draining', async () => {
  let release;
  const gate = new Promise(resolve => {
      release = resolve;
    }),
    f = mockBootstrap(bootstrap, { gate }),
    r = f.api.createM4LocalQualificationRuntime(configuration);
  const operation = r.execute('unit', command('ops'));
  await new Promise(setImmediate);
  assert.equal(f.factories.length, 1);
  const close = r.close();
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(r), /actual closed local owner/);
  release();
  await Promise.all([operation, close]);
  assert.equal(f.api.takeM4OwnedAssignmentContexts(r).rows.length, 1);
});

test('throwing invocation preserves its unresolved scalar capture without a completed response', async () => {
  const f = mockBootstrap(bootstrap, { throwController: true }),
    r = f.api.createM4LocalQualificationRuntime(configuration);
  assert.equal((await r.execute('unit', command('ops'))).status, 'indeterminate');
  await r.close();
  const rows = f.api.takeM4OwnedAssignmentContexts(r).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].responseDigest, null);
});

test('actual local bookkeeping overflow prevents witness take', async () => {
  const f = mockBootstrap(),
    r = f.api.createM4LocalQualificationRuntime(configuration);
  for (let i = 0; i < 129; i++) await r.execute('unit', command('ops'));
  await r.close();
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(r), /actual closed local owner/);
});

for (const [label, to] of [
  ['receiver', 'Object.freeze({ database: {}, verifySession })'],
  ['verifier', 'Object.freeze({ database, verifySession: () => null })'],
  ['mutable configuration', '({ database, verifySession })'],
])
  test('actual lexical reference predicate rejects wrong ' + label, async () => {
    const f = mockBootstrap(bootstrap.replace('Object.freeze({ database, verifySession })', to)),
      r = f.api.createM4LocalQualificationRuntime(configuration);
    assert.equal((await r.execute('unit', command('ops'))).status, 'indeterminate');
    await r.close();
    assert.throws(() => f.api.takeM4OwnedAssignmentContexts(r), /actual closed local owner/);
  });

test('production constructor has no local qualification membership', async () => {
  const f = mockBootstrap(),
    r = f.api.createM4PrivateRuntime(configuration);
  await r.execute('unit', command('ops'));
  await r.close();
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(r), /actual closed local owner/);
});

test('public mocked constructor counterexample cannot mint private runtime/image ownership', async () => {
  const { record } = await executeFamily(mockBootstrap());
  assert.equal(record.rows.length, 4);
  // Plausible rows exist under explicit mocks, proving rows/WeakMap membership alone
  // are insufficient. The real privately branded fixed producer owner still refuses.
  const fake = {
    executed: true,
    completion: { assignmentContextConstruction: record },
    assignmentContextConstruction: record,
  };
  assert.throws(
    () =>
      proof.linkOwnedAssignmentContexts({
        runtime: fake,
        event: { context: {} },
        source: {},
        native: {},
        contract: {},
        fixedLinks: [],
      }),
    /foreign runtime\/image/
  );
});

test('empty operation set is insufficient until notification owner close really drains', async () => {
  let release;
  const notificationCloseGate = new Promise(resolve => {
      release = resolve;
    }),
    f = mockBootstrap(bootstrap, { notificationCloseGate }),
    r = f.api.createM4LocalQualificationAssignmentRuntime(configuration);
  const close = r.close();
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(r), /actual closed local owner/);
  release();
  await close;
  assert.equal(f.api.takeM4OwnedAssignmentContexts(r).rows.length, 0);
});

test('retained lexical capture is bounded immutable scalar data and frozen config cannot rebind', async () => {
  const f = mockBootstrap(),
    { record } = await executeFamily(f);
  for (const item of f.factories) {
    assert(Object.isFrozen(item.configuration));
    assert.throws(() => {
      item.configuration.database = {};
    }, TypeError);
  }
  for (const row of record.rows) {
    assert(Object.isFrozen(row));
    assert.equal(Object.keys(row).length, 9);
    assert.match(row.operationId, /^[a-f0-9-]{36}$/);
    assert.match(row.requestDigest, /^[a-f0-9]{64}$/);
    assert.match(row.responseDigest, /^[a-f0-9]{64}$/);
    assert(
      Object.values(row).every(value => ['string', 'number', 'boolean'].includes(typeof value))
    );
  }
  const helper = runtimeSources.contextSource,
    helperUnit = ts.createSourceFile('context.ts', helper, ts.ScriptTarget.Latest, true),
    returns = [],
    pushes = [];
  function inspect(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'observeM4AssignmentInvocation')
      returns.push(node.body.statements.at(-1).expression);
    if (ts.isCallExpression(node) && node.expression.getText(helperUnit) === 'state.rows.push')
      pushes.push(node);
    ts.forEachChild(node, inspect);
  }
  inspect(helperUnit);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].arguments[0].getText(helperUnit), 'row');
  assert.equal(returns.length, 1);
  assert.equal(returns[0].expression.getText(helperUnit), 'Object.freeze');
  const literal = returns[0].arguments[0];
  assert.deepEqual(
    literal.properties.map(p => p.name.getText(helperUnit)),
    [
      'ordinal',
      'profile',
      'receiver',
      'verifier',
      'configurationIdentityChecked',
      'capturedAfterPosture',
    ]
  );
  assert(!/new (?:WeakMap|WeakSet|Map)\b/.test(helper));
  const row = { ...record.rows[0], profile: 'legacy-admin', ordinal: 128 };
  const rows = Array.from({ length: 2048 }, () => row);
  const transcript = rows.map(value => ({
    profile: value.profile,
    path: '/m4/assignment/legacy-admin',
    operationId: value.operationId,
    requestDigest: value.requestDigest,
    responseDigest: value.responseDigest,
    outcome: 'completed',
    delivery: 'finished',
  }));
  const scalarEnvelope = {
    assignmentContexts: rows,
    mountedAssignments: {
      owners: Array.from({ length: 256 }, (_, index) => ({
        runtimeId: index + 1,
        version: 1,
        localQualificationOnly: true,
      })),
      contexts: rows,
      transport: transcript,
    },
  };
  // Aggregate source limits bound retained scalar data. The separate 1 MiB actual
  // completion-file cap can still refuse a worst-case envelope; this is no fit claim.
  assert(Buffer.byteLength(JSON.stringify(scalarEnvelope)) < 8 * 1024 * 1024);
});

test('settlement preserves original invocation ordinal and rejects replay or row replacement', () => {
  for (const replace of [false, true]) {
    const f = mockBootstrap(),
      state = { budget: { used: 0, refused: false }, refused: false, rows: [] };
    const database = {},
      verifySession = () => null,
      identity = {},
      data = {};
    const settle = f.context.bindM4AssignmentInvocation(
      state,
      'ops',
      Object.freeze({ database, verifySession }),
      database,
      verifySession,
      identity,
      data,
      JSON.parse(command('ops'))
    );
    assert.equal(state.rows[0].responseDigest, null);
    assert.equal(state.rows[0].ordinal, 1);
    const result = { status: 'completed', result: { success: true } };
    if (replace) state.rows[0] = { ...state.rows[0] };
    else {
      assert.equal(settle(result), result);
      assert.equal(state.rows[0].ordinal, 1);
      assert.match(state.rows[0].responseDigest, /^[a-f0-9]{64}$/);
    }
    assert.throws(() => settle(result), /settlement changed/);
    assert.equal(state.refused, true);
  }
});

test('shared capture reservation stays bounded across closed and consumed owners', async () => {
  const f = mockBootstrap();
  for (let owner = 0; owner < 16; owner++) {
    const runtime = f.api.createM4LocalQualificationRuntime(configuration);
    for (let row = 0; row < 128; row++)
      assert.equal((await runtime.execute('unit', command('ops'))).status, 'completed');
    await runtime.close();
    assert.equal(f.api.takeM4OwnedAssignmentContexts(runtime).rows.length, 128);
  }
  const overflow = f.api.createM4LocalQualificationRuntime(configuration);
  assert.equal((await overflow.execute('unit', command('ops'))).status, 'indeterminate');
  await overflow.close();
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(overflow), /actual closed local owner/);
});
