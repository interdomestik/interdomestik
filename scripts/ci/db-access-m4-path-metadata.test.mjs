import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './db-access-m4-selected-path-observer.test-fixture.mjs';
import { createM4PathBudget, pathCount } from './db-access-m4-path-storage.mjs';
import { M4_PATH_LIMITS } from './db-access-m4-path-limits.mjs';

test('peek-unavailable tokens retain distinct local IDs without invoking another reader', () => {
  const f = fixture(),
    tokens = [{}, {}];
  for (const context of tokens) {
    const scope = f.enter([f.row()], f.selected, context);
    f.collector.push({ file: 'root.ts', reason: 'unknown frame' });
    f.observer.leave(scope);
  }
  const out = f.finish();
  assert.equal(f.reads.peek, 2);
  assert.equal(out.frames.length, 2);
  assert(out.frames.every(frame => frame.status === 'unavailable'));
  assert.notEqual(out.scopes[0].traversalContext, out.scopes[1].traversalContext);
});

test('known bindings preserve exact source locations, actual open ancestry and detached records', () => {
  const f = fixture(),
    token = {},
    parameter = { file: 'selected.ts', pos: 2, end: 3, kind: 169 };
  const argument = { file: 'caller.ts', pos: 5, end: 6, kind: 80 };
  const binding = Object.freeze({ parameter, argument, callerContext: undefined });
  f.bindings.set(token, Object.freeze([binding]));
  const scope = f.enter([f.row()], f.selected, token);
  f.collector.push({ file: 'root.ts', reason: 'known frame' });
  f.collector.push({ file: 'root.ts', reason: 'known frame' });
  f.observer.leave(scope);
  const out = f.finish();
  assert.equal(f.reads.peek, 1);
  assert.equal(Object.isFrozen(parameter), false);
  assert.equal(out.frames[0].status, 'available');
  assert.deepEqual(out.frames[0].bindings, [
    {
      parameter: ['selected.ts', 2, 3, 169],
      argument: ['caller.ts', 5, 6, 80],
      callerFrame: null,
    },
  ]);
  assert.equal(out.records[0].occurrences, 2);
});

test('recursive metadata is explicit and never encoded as an available open caller', () => {
  const f = fixture(),
    token = {};
  f.bindings.set(token, [{ parameter: f.selected, argument: f.child, callerContext: token }]);
  const scope = f.enter([f.row()], f.selected, token);
  f.collector.push({ file: 'root.ts', reason: 'cycle' });
  f.observer.leave(scope);
  const out = f.finish();
  assert.equal(out.frames[0].status, 'recursive');
  assert.equal(Object.hasOwn(out.frames[0], 'bindings'), false);
});

test('reused batches reset local state without rewriting the previous output', () => {
  const f = fixture(),
    row = f.row(),
    first = f.enter([row]);
  f.collector.push({ file: 'root.ts', reason: 'first' });
  f.observer.leave(first);
  const before = f.finish(),
    retained = structuredClone(before);
  f.observer.begin();
  const detach = f.observer.installDiagnostics(f.collector);
  const next = f.enter([row]);
  row.occurrences++;
  f.collector.push({ file: 'root.ts', reason: 'second' });
  f.observer.leave(next);
  detach();
  const after = f.observer.finish();
  assert.deepEqual(before, retained);
  assert.equal(after.counters.collectorInitialRawCount, 1);
  assert.equal(after.counters.selectedPathOccurrences, 1);
});

test('original push exceptions propagate unchanged and prevent a completed output', () => {
  const f = fixture(),
    scope = f.enter(),
    error = Error('original reason getter');
  try {
    assert.throws(
      () =>
        f.collector.push({
          file: 'root.ts',
          get reason() {
            throw error;
          },
        }),
      value => value === error
    );
  } finally {
    f.observer.leave(scope);
    f.detach();
  }
  assert.throws(() => f.observer.finish(), /failed/);
});

test('scope, record and shared frame/selection count limits refuse without truncation', () => {
  for (const kind of ['scopes', 'records', 'metadata']) {
    const budget = createM4PathBudget();
    for (let i = 0; i < M4_PATH_LIMITS[kind]; i++) budget.charge(kind, '{}');
    const prior = budget.snapshot();
    assert.throws(() => budget.charge(kind, '{}'), /storage ceiling/);
    assert.deepEqual(budget.snapshot(), prior);
  }
});

test('64MiB encoded reserve is a hard refusal boundary, not a measured RSS claim', () => {
  const budget = createM4PathBudget();
  budget.charge('metadata', 'x'.repeat(M4_PATH_LIMITS.encodedBytes));
  assert.equal(budget.snapshot().encodedBytes, M4_PATH_LIMITS.encodedBytes);
  assert.throws(() => budget.charge('metadata', 'x'), /storage ceiling/);
});

test('count arithmetic fails closed on negatives, nonintegers and overflow', () => {
  for (const value of [-1, 0.5, NaN, Infinity]) assert.throws(() => pathCount(0, value), /count/);
  assert.throws(() => pathCount(Number.MAX_SAFE_INTEGER, 1), /count/);
});

test('metadata reader exceptions cannot be caught to obtain a partial completed trace', () => {
  const f = fixture(),
    context = {},
    error = Error('metadata read failed');
  f.bindings.get = () => {
    throw error;
  };
  const scope = f.enter([f.row()], f.selected, context);
  try {
    assert.throws(
      () => f.collector.push({ file: 'root.ts', reason: 'original survives' }),
      value => value === error
    );
  } finally {
    f.observer.leave(scope);
    f.detach();
  }
  assert.equal(f.collector.rawCount, 1);
  assert.equal(f.collector.entries[0].reason, 'original survives');
  assert.throws(() => f.observer.finish(), /failed/);
});

test('frame depth ceiling refuses instead of silently dropping ancestor metadata', () => {
  const f = fixture(),
    tokens = Array.from({ length: 65 }, () => ({}));
  tokens.forEach((token, index) =>
    f.bindings.set(token, [
      {
        parameter: f.selected,
        argument: f.child,
        callerContext: tokens[index + 1],
      },
    ])
  );
  const scope = f.enter([f.row()], f.selected, tokens[0]);
  try {
    assert.throws(() => f.collector.push({ file: 'root.ts', reason: 'deep' }), /depth ceiling/);
  } finally {
    f.observer.leave(scope);
    f.detach();
  }
  assert.throws(() => f.observer.finish(), /failed/);
});
