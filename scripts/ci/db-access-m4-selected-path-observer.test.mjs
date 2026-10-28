import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './db-access-m4-selected-path-observer.test-fixture.mjs';
import {
  createM4AttributionCollector,
  m4AttributionKey,
} from './db-access-m4-context-attribution.mjs';

test('off-path pushes preserve collector identity/getters, full counts and no trace metadata work', () => {
  const f = fixture(),
    entries = f.collector.entries;
  const getter = Object.getOwnPropertyDescriptor(f.collector, 'rawCount').get;
  const token = f.observer.enter(f.child, 'root.ts');
  assert.equal(token, null);
  f.collector.push(
    { file: 'root.ts', reason: undefined },
    { file: 'root.ts', reason: null, occurrences: 3 }
  );
  f.observer.leave(token);
  assert.equal(f.collector.entries, entries);
  assert.equal(Object.getOwnPropertyDescriptor(f.collector, 'rawCount').get, getter);
  const out = f.finish();
  assert.equal(out.counters.offPathOccurrences, 4);
  assert.deepEqual(f.reads, { locate: 0, peek: 0 });
  for (const field of ['selections', 'frames', 'scopes', 'records'])
    assert.deepEqual(out[field], []);
});

test('nested selected owners and unselected descendants emit once for a union of active keys', () => {
  const f = fixture();
  f.owners.add(f.child);
  const a = f.enter([f.row('a'), f.row('b')]);
  const b = f.enter([f.row('c', 'root.ts', f.child)], f.child);
  const leaf = { file: 'leaf.ts', pos: 0, end: 3, kind: 262 };
  const c = f.observer.enter(leaf, 'root.ts');
  f.collector.push({ file: 'root.ts', reason: 'descendant', occurrences: 2 });
  f.observer.leave(c);
  f.observer.leave(b);
  f.collector.push({ file: 'root.ts', reason: 'ancestor' });
  f.observer.leave(a);
  f.collector.push({ file: 'root.ts', reason: 'sibling outside' });
  const out = f.finish();
  assert.equal(out.counters.selectedPathOccurrences, 3);
  assert.equal(out.counters.offPathOccurrences, 1);
  const scope = out.scopes.find(value => value.id === out.records[0].scopeId);
  assert.equal(
    out.selections.find(value => value.id === scope.selectionId).observationKeys.length,
    3
  );
  assert.equal(scope.emitterOwner[0], 'leaf.ts');
});

test('legacy overlap tags the adjacent emission once without changing old four-kind row fields', () => {
  const f = fixture(),
    row = f.row(),
    legacy = createM4AttributionCollector();
  const token = f.enter([row]);
  const first = legacy.add([row], 'entry-incomplete', 'why');
  f.collector.push({ file: 'root.ts', reason: 'why' });
  f.observer.legacy(first, 'root.ts', 'why');
  f.collector.push({ file: 'root.ts', reason: 'why' });
  const second = legacy.add([row], 'entry-incomplete', 'why');
  f.observer.legacy(second, 'root.ts', 'why');
  f.collector.push({ file: 'root.ts', reason: 'why' });
  f.observer.leave(token);
  const out = f.finish();
  assert.equal(first, second);
  assert.equal(first, m4AttributionKey(legacy.entries()[0]));
  assert.equal(Object.hasOwn(legacy.entries()[0], 'key'), false);
  assert.equal(legacy.entries()[0].occurrences, 2);
  assert.equal(out.counters.selectedPathOccurrences, 3);
  assert.equal(out.counters.legacyOverlapOccurrences, 2);
  assert.equal(out.counters.additionalPathOccurrences, 1);
  assert.equal(out.records.find(value => value.legacyDiagnosticKey === first).occurrences, 2);
});

test('multiargument/default occurrences and undefined/null reasons retain original compaction', () => {
  const f = fixture(),
    token = f.enter();
  f.collector.push(
    { file: 'root.ts', reason: undefined },
    { file: 'root.ts', reason: null, occurrences: 2 }
  );
  f.collector.push({ file: 'root.ts', reason: '', occurrences: 3 });
  f.observer.leave(token);
  const out = f.finish();
  assert.equal(f.collector.entries.length, 2);
  assert.equal(
    out.records.find(value => value.diagnosticKey === '["root.ts",null]').occurrences,
    3
  );
  assert.equal(out.counters.wrappedOccurrences, 6);
  assert.equal(out.counters.selectedPathOccurrences, 6);
});

test('evaluation overrides distinguish actual open context and restore traversal frame/site', () => {
  const f = fixture(),
    context = {},
    site = { file: 'selected.ts', pos: 4, end: 8, kind: 214 };
  f.bindings.set(context, []);
  const owner = f.enter([f.row()], f.selected, context);
  const evaluation = f.observer.enterEvaluation(undefined, site);
  try {
    f.collector.push({ file: 'root.ts', reason: 'channel' });
  } finally {
    f.observer.leaveEvaluation(evaluation);
  }
  f.collector.push({ file: 'root.ts', reason: 'regular' });
  f.observer.leave(owner);
  const out = f.finish(),
    explicit = out.scopes.find(
      value => value.evaluationContextStatus === 'explicit-channel-context'
    );
  assert.equal(explicit.evaluationContext, null);
  assert.notEqual(explicit.traversalContext, null);
  assert.deepEqual(explicit.evaluationSite, ['selected.ts', 4, 8, 214]);
  assert.equal(
    out.scopes.find(value => value.evaluationContextStatus === 'traversal-context-only')
      .evaluationSite,
    null
  );
});

test('finally restoration prevents selected scope leakage after a traversal exception', () => {
  const f = fixture(),
    error = Error('original traversal');
  assert.throws(
    () => {
      const token = f.enter();
      try {
        f.collector.push({ file: 'root.ts', reason: 'before throw' });
        throw error;
      } finally {
        f.observer.leave(token);
      }
    },
    value => value === error
  );
  f.collector.push({ file: 'root.ts', reason: 'after catch outside' });
  const out = f.finish();
  assert.equal(out.counters.selectedPathOccurrences, 1);
  assert.equal(out.counters.offPathOccurrences, 1);
});

test('missing/ambiguous overlap and non-LIFO restoration poison completion but permit cleanup', () => {
  for (const action of [
    f => f.observer.legacy('a'.repeat(64), 'root.ts', 'why'),
    f => {
      f.collector.push({ file: 'root.ts', reason: 'why' }, { file: 'root.ts', reason: 'why' });
      f.observer.legacy('a'.repeat(64), 'root.ts', 'why');
    },
    f => f.observer.leave({}),
  ]) {
    const f = fixture(),
      token = f.enter();
    assert.throws(() => action(f), /legacy|non-LIFO/);
    f.observer.leave(token);
    f.detach();
    assert.throws(() => f.observer.finish(), /failed/);
  }
});

test('detach always restores original push, and finish uses detach-time count before late metadata', () => {
  const f = fixture(),
    token = f.enter();
  f.collector.push({ file: 'root.ts', reason: 'selected' });
  f.observer.leave(token);
  assert.throws(() => f.observer.finish(), /detach/);
  f.detach();
  const push = f.collector.push;
  assert.equal(push, f.originalPush);
  f.collector.push({ file: '<analysis>', reason: 'late' });
  const out = f.observer.finish();
  assert.equal(out.counters.collectorFinalRawCount, 1);
  assert.equal(f.collector.rawCount, 2);
  f.detach();
  assert.equal(f.collector.push, push);
});

test('bypassing the wrapped push cannot produce a complete trace', () => {
  const f = fixture();
  // Simulate an unobserved write without giving the observer a fabricated receipt.
  Object.defineProperty(f.collector, 'rawCount', { get: () => 1 });
  f.detach();
  assert.throws(() => f.observer.finish(), /unobserved original collector writes/);
});

test('a same-key parent emission cannot be tagged as a newly entered child overlap', () => {
  const f = fixture();
  f.owners.add(f.child);
  const parent = f.enter([f.row('parent')]);
  f.collector.push({ file: 'root.ts', reason: 'same' });
  const row = f.row('child', 'root.ts', f.child);
  const child = f.enter([row], f.child);
  const legacy = createM4AttributionCollector();
  const key = legacy.add([row], 'entry-incomplete', 'same');
  assert.throws(() => f.observer.legacy(key, 'root.ts', 'same'), /legacy diagnostic overlap/);
  f.observer.leave(child);
  f.observer.leave(parent);
  f.detach();
  assert.equal(f.collector.rawCount, 1);
  assert.deepEqual(f.collector.entries, [{ file: 'root.ts', reason: 'same', occurrences: 1 }]);
  assert.throws(() => f.observer.finish(), /failed/);
});
