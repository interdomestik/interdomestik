import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { harness } from './db-access-invocation-effects-capture-fixture.mjs';
import {
  DISPATCH_SOURCES,
  EVIDENCE_SOURCE,
  clientFixture,
  contextualFixture,
  describePlainInvocation,
  describeResolvedTarget,
  dispatchSnapshot,
  evidenceFixture,
  names,
} from './db-access-sonar-preservation-fixture.mjs';

const list = count => `const list = [${names(count)}];`;

// One decrement for the array root plus one per element: 2047 elements end at remaining 0.
test('contextual handle budget is exactly 2048 decrements per public root', () => {
  for (const [count, expected, leafCount] of [
    [2047, false, 2047],
    [2048, 'unknown', 2047],
  ]) {
    const { contextual, leaves, initializer } = contextualFixture(list(count));
    assert.equal(contextual.handle(initializer('list')), expected, String(count));
    assert.equal(leaves.length, leafCount, String(count));
  }
});

test('every new public root starts with a fresh budget after an exhausted root', () => {
  const { contextual, initializer } = contextualFixture(
    `${list(2048)} const small = [${names(2047, 'b')}];`
  );
  const facade = contextual.facade(undefined);
  assert.equal(contextual.handle(initializer('list')), 'unknown');
  assert.equal(contextual.handle(initializer('small')), false);
  assert.equal(facade.tenantHandle(initializer('list')), 'unknown');
  assert.equal(facade.tenantHandle(initializer('small')), false);
});

test('recursive composite branches share one root budget', () => {
  for (const [size, expected, leafCount] of [
    [1022, false, 2044],
    [1023, 'unknown', 2045],
  ]) {
    const { contextual, leaves, initializer } = contextualFixture(
      `const nested = [[${names(size)}],[${names(size, 'b')}]];`
    );
    assert.equal(contextual.handle(initializer('nested')), expected, String(size));
    assert.equal(leaves.length, leafCount, String(size));
  }
});

test('every branch is evaluated in order even after a true branch', () => {
  const answers = new Map([
    ['hit', true],
    ['u', 'unknown'],
  ]);
  const leaf = text => answers.get(text) ?? false;
  for (const [source, expected, order] of [
    ['const pick = [hit, a, b];', true, ['hit', 'a', 'b']],
    ['const pick = [u, hit];', true, ['u', 'hit']],
    ['const pick = [u, a];', 'unknown', ['u', 'a']],
    ['const pick = [a];', false, ['a']],
    ['const pick = flag ? hit : a;', true, ['hit', 'a']],
    ['const pick = a || hit;', true, ['a', 'hit']],
  ]) {
    const { contextual, leaves, initializer } = contextualFixture(source, leaf);
    assert.equal(contextual.handle(initializer('pick')), expected, source);
    assert.deepEqual(leaves, order, source);
  }
});

test('a handled false answer is returned while unhandled syntax reaches the legacy fallback', () => {
  const handled = contextualFixture('const pick = c ? a : b;');
  assert.equal(handled.contextual.handle(handled.initializer('pick')), false);
  assert.deepEqual(handled.leaves, ['a', 'b']);
  const fallback = contextualFixture('const pick = a + b;');
  assert.equal(fallback.contextual.handle(fallback.initializer('pick')), false);
  assert.deepEqual(fallback.leaves, ['a + b']);
});

test('immutable const identity revisit is false while a let identity revisit stays unknown', () => {
  const { contextual, find } = contextualFixture(
    'const box = { run() { return box; } }; let bag = { run() { return bag; } };'
  );
  const returned = name =>
    find(node => ts.isIdentifier(node) && node.text === name && ts.isReturnStatement(node.parent));
  assert.equal(contextual.handle(returned('box')), false);
  assert.equal(contextual.handle(returned('bag')), 'unknown');
});

test('destructured client holders resolve only through an actual initializer', () => {
  const { symbols, find } = clientFixture(
    'import {db} from "@interdomestik/database"; const holder = { client: db }; const { client } = holder; client; function read({ client: c }) { return c; } const { other } = holder; other;'
  );
  const used = name =>
    find(
      node => ts.isIdentifier(node) && node.text === name && ts.isExpressionStatement(node.parent)
    );
  const parameter = find(
    node => ts.isIdentifier(node) && node.text === 'c' && ts.isReturnStatement(node.parent)
  );
  assert.equal(symbols.clientIdentity(used('client')), 'db');
  assert.equal(symbols.clientIdentity(parameter), 'unknown');
  assert.equal(symbols.clientIdentity(used('other')), 'unknown');
});

test('accessor and let/var/const alias effects match the frozen reference in order', () => {
  for (const [source, unknown] of [
    [
      'const a = {}; const box = { get x() { return a; }, set x(v) {}, y: a }; export const f = () => box;',
      ['effect-accessor'],
    ],
    [
      'const a = {}; let l = a; var v = a; const c = a; export const f = () => [l, v, c];',
      ['effect-mutable-alias'],
    ],
    ['const a = {}; const c = a; export const f = () => [c, c];', []],
  ]) {
    const h = harness(source);
    for (let repeat = 0; repeat < 2; repeat++)
      assert.deepEqual(h.origins(h.declared('f'), undefined).result.unknown, unknown, source);
  }
});

for (const [label, source] of Object.entries(DISPATCH_SOURCES))
  test(`dispatch snapshot is reproducible across models and reset: ${label}`, () => {
    const first = dispatchSnapshot(source);
    assert.deepEqual(dispatchSnapshot(source), first);
    assert.deepEqual(dispatchSnapshot(source, { reset: true }), first);
    assert.equal(first.frozenBudget, true);
    assert.ok(first.budget.rounds >= 1);
  });

test('dispatch registers intermediaries before their target', () => {
  const snapshot = dispatchSnapshot(DISPATCH_SOURCES['factory-intermediate']);
  assert.equal(snapshot.settled, true, String(snapshot.reasons));
  assert.deepEqual(snapshot.callerNames, ['make', 'run']);
  assert.equal(dispatchSnapshot(DISPATCH_SOURCES['mixed-callers']).settled, true);
});

test('dispatch callers keep plain intermediary and strict resolved-target schemas distinct', () => {
  const snapshot = dispatchSnapshot(DISPATCH_SOURCES['factory-intermediate']);
  const named = new Map(snapshot.callerNames.map((name, index) => [name, snapshot.callers[index]]));
  const [makeLocation, makeCallers] = named.get('make');
  const [, runCallers] = named.get('run');
  const plain = makeCallers.filter(entry => entry.kind === 'intermediary');
  assert.ok(plain.length > 0);
  for (const entry of plain) assert.equal('intermediates' in entry, false);
  assert.ok(runCallers.length > 0 && runCallers.every(entry => entry.kind === 'target'));
  assert.deepEqual(
    runCallers[0].intermediates.map(entry => entry.function),
    [makeLocation]
  );
});

test('serializers reject schema confusion instead of normalizing it', () => {
  const loc = () => 'location';
  assert.throws(() => describeResolvedTarget({}, loc), TypeError);
  assert.throws(() => describePlainInvocation({ resolutionInvocations: [] }, loc), TypeError);
});

test('evidence keeps intermediate-before-target callsFor order in every pass', () => {
  const { evidence, find, snapshot } = evidenceFixture(EVIDENCE_SOURCE, ['id(id)(1)']);
  const id = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'id');
  assert.equal(evidence.settled, true, String(evidence.reasons));
  assert.equal(snapshot.passes.length, 2);
  assert.deepEqual(
    evidence.callsFor(id).map(item => item.callNode.getText()),
    ['id(id)', 'id(id)(1)', 'id(id)', 'id(id)(1)']
  );
  assert.throws(() => evidence.callsFor(id).push({}), TypeError);
  assert.deepEqual(evidenceFixture(EVIDENCE_SOURCE, ['id(id)(1)']).snapshot, snapshot);
});
