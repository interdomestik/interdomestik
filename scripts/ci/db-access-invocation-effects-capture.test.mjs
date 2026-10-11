import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createInvocationEffects } from './db-access-invocation-effects.mjs';
import { harness } from './db-access-invocation-effects-capture-fixture.mjs';
import {
  FIXTURE_A,
  FIXTURE_B,
  FIXTURE_C,
  FIXTURE_D,
  FIXTURES,
} from './db-access-invocation-effects-capture-cases.mjs';

test('repeated same-frame and root-frame replays match the frozen reference exactly', () => {
  for (const [label, fixture] of Object.entries(FIXTURES)) {
    const h = harness(fixture.source);
    const roots = fixture.roots(h);
    const first = roots.map(([raw, ctx]) => h.origins(raw, ctx).snapshot);
    for (let repeat = 0; repeat < 4; repeat++)
      roots.forEach(([raw, ctx], index) =>
        assert.deepEqual(h.origins(raw, ctx).snapshot, first[index], label)
      );
  }
});

test('distinct caller frames and reversed allocations keep their own actual arguments', () => {
  for (const allocation of [
    ['make(a)', 'make(b)'],
    ['make(b)', 'make(a)'],
  ]) {
    const h = harness(FIXTURE_A.source);
    for (const text of allocation) h.context(text);
    const named = h.declared('named');
    const callback = h.declared('callback');
    const returned = h.returned('named');
    for (const order of [allocation, [...allocation].reverse()])
      for (let repeat = 0; repeat < 3; repeat++)
        for (const text of order) {
          const context = h.context(text);
          const own = h.call(text).arguments[0];
          const other = h.call(text === 'make(a)' ? 'make(b)' : 'make(a)').arguments[0];
          const { result } = h.origins(returned, context);
          const nodes = result.values.map(item => item.node);
          assert.ok(nodes.includes(own), text);
          assert.ok(!nodes.includes(other), text);
          assert.ok(result.functions.some(item => item.node === named && item.context === context));
          assert.ok(
            result.functions.some(item => item.node === callback && item.context === context)
          );
          assert.deepEqual(result.unknown, []);
        }
  }
});

test('conditional, logical, computed, spread, default and receiver evidence is preserved', () => {
  const h = harness(FIXTURE_B.source);
  const [bound, , open, method, classMethod] = FIXTURE_B.roots(h);
  const { result } = h.origins(...bound);
  for (const reason of ['effect-default-parameter', 'effect-computed-property', 'effect-spread'])
    assert.ok(result.unknown.includes(reason), reason);
  assert.ok(!result.unknown.includes('unbound-effect-parameter'));
  const nodes = result.values.map(item => item.node);
  for (const argument of h.call('make(a, b)').arguments) assert.ok(nodes.includes(argument));
  assert.ok(h.origins(...open).result.unknown.includes('unbound-effect-parameter'));
  const receiver = h.origins(...method).result.unknown;
  for (const reason of ['effect-receiver-capture', 'effect-default-parameter', 'effect-cycle'])
    assert.ok(receiver.includes(reason), reason);
  const sub = h.origins(...classMethod).result.unknown;
  for (const reason of ['effect-receiver-capture', 'effect-default-parameter'])
    assert.ok(sub.includes(reason), reason);
});

test('live escape and mutation flips are observed by every capture replay', () => {
  const h = harness(FIXTURE_C.source);
  const roots = FIXTURE_C.roots(h);
  const make = h.declared('make');
  const factory = h.declared('factory');
  const callback = h.declared('callback');
  const argument = h.call('factory().make(a)').arguments[0];
  const user = h.declared('user');
  for (const [label, mutated, escaped] of [
    ['none', [], []],
    ['escaped make', [], [make]],
    ['none', [], []],
    ['escaped callback', [], [callback]],
    ['mutated factory', [factory], []],
    ['none', [], []],
  ]) {
    h.live.mutated = new Set(mutated);
    h.live.escaped = new Set(escaped);
    for (let repeat = 0; repeat < 2; repeat++) for (const [raw, ctx] of roots) h.origins(raw, ctx);
    const blocked = label === 'escaped make' || label === 'mutated factory';
    const { result } = h.origins(user, undefined);
    assert.equal(result.unknown.includes('effect-call-result'), blocked, label);
    assert.equal(
      result.values.some(item => item.node === argument),
      !blocked,
      label
    );
    const direct = h.origins(h.call('made()'), undefined).result;
    assert.equal(direct.unknown.includes('effect-call-result'), label !== 'none', label);
  }
});

test('same AST in distinct defining frames is not a cycle while actual self reference is', () => {
  const h = harness(FIXTURE_A.source);
  const pair = h.find(
    node => ts.isArrayLiteralExpression(node) && ts.isVariableDeclaration(node.parent)
  );
  const named = h.declared('named');
  for (let repeat = 0; repeat < 3; repeat++) {
    const { result } = h.origins(pair, undefined);
    assert.ok(!result.unknown.includes('effect-cycle'));
    const nodes = result.values.map(item => item.node);
    for (const element of pair.elements) assert.ok(nodes.includes(element.arguments[0]));
    const frames = result.functions.filter(item => item.node === named).map(item => item.context);
    assert.equal(frames.length, 2);
    assert.notEqual(frames[0], frames[1]);
  }
  const d = harness(FIXTURE_D.source);
  for (const [raw, ctx] of FIXTURE_D.roots(d))
    assert.ok(d.origins(raw, ctx).result.unknown.includes('effect-cycle'));
});

test('low step budgets and cycles keep identical bounded results', () => {
  let exceeded = 0;
  for (const fixture of Object.values(FIXTURES))
    for (const maxSteps of [1, 2, 3, 5, 8, 13, 21, 34, 512]) {
      const h = harness(fixture.source, { maxSteps });
      const roots = fixture.roots(h);
      for (let repeat = 0; repeat < 3; repeat++)
        for (const [raw, ctx] of roots)
          if (h.origins(raw, ctx).result.unknown.includes('effect-budget-exceeded')) exceeded += 1;
    }
  assert.ok(exceeded > 0);
});

test('capture plans walk each function body once per effects instance under many replays', t => {
  const h = harness(FIXTURE_A.source);
  const roots = FIXTURE_A.roots(h);
  const rounds = 25;
  const captured = new Set();
  let captures = 0;
  for (let round = 0; round < rounds; round++)
    for (const [raw, ctx] of roots) {
      const { result } = h.origins(raw, ctx);
      captures += result.functions.length;
      for (const item of result.functions) captured.add(item.node);
    }
  assert.equal(h.reference.counts.walks, captures);
  assert.equal(h.candidate.counts.walks, captured.size);
  assert.ok(h.candidate.counts.walked * rounds <= h.reference.counts.walked);
  t.diagnostic(
    `deterministic work counts over ${rounds} rounds: ${JSON.stringify({
      reference: h.reference.counts,
      candidate: h.candidate.counts,
    })}`
  );
  const second = h.instrument(createInvocationEffects);
  const [raw, ctx] = roots[0];
  const fresh = second.effects.origins(raw, ctx);
  assert.equal(second.counts.walks, new Set(fresh.functions.map(item => item.node)).size);
  for (const fixture of [FIXTURE_B, FIXTURE_C, FIXTURE_D]) {
    const other = harness(fixture.source);
    const list = fixture.roots(other);
    for (const [item, context] of list) other.origins(item, context);
    const warm = other.candidate.counts.walks;
    const before = other.reference.counts.walks;
    for (let round = 0; round < 10; round++)
      for (const [item, context] of list) other.origins(item, context);
    assert.equal(other.candidate.counts.walks, warm);
    assert.ok(other.reference.counts.walks > before);
  }
});

test('errors propagate during plan construction and replay without caching a partial plan', () => {
  const h = harness(FIXTURE_A.source);
  const ctx = h.context('make(a)');
  const raw = h.returned('named');
  const boom = new Error('bindings unavailable');
  h.live.fail = boom;
  for (const side of [h.reference, h.candidate])
    assert.throws(
      () => side.effects.origins(raw, ctx),
      error => error === boom
    );
  const partial = h.candidate.counts.walks;
  h.live.fail = undefined;
  const { result } = h.origins(raw, ctx);
  assert.equal(
    h.candidate.counts.walks,
    partial + new Set(result.functions.map(item => item.node)).size
  );
  const warm = h.candidate.counts.walks;
  h.live.fail = boom;
  for (const side of [h.reference, h.candidate])
    assert.throws(
      () => side.effects.origins(raw, ctx),
      error => error === boom
    );
  assert.equal(h.candidate.counts.walks, warm);
  h.live.fail = undefined;
  h.origins(raw, ctx);
  assert.equal(h.candidate.counts.walks, warm);
});

for (const [count, receiver] of [
  [255, false],
  [256, false],
  [256, true],
]) {
  test(`capture boundary ${count} references, receiver ${receiver}, preserves ordered evidence`, () => {
    const source = `const a=0; export const f=()=>[${Array(count).fill('a').join(',')}${receiver ? ',this' : ''}];`;
    const h = harness(source);
    const fn = h.declared('f');
    const expected =
      count === 255
        ? []
        : receiver
          ? ['effect-budget-exceeded', 'effect-receiver-capture']
          : ['effect-budget-exceeded'];
    let first;
    for (let repeat = 0; repeat < 3; repeat++) {
      const { result } = h.origins(fn, undefined);
      assert.deepEqual(result.unknown, expected);
      assert.equal(result.values.length, count);
      assert.equal(result.functions[0].node, fn);
      assert.equal(result.functions[0].context, undefined);
      assert.ok(result.values.every(item => item.context === undefined));
      if (first) assert.deepEqual(result, first);
      first = result;
    }
  });
}
