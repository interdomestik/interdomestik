import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';
import { createDependencyMemo } from './db-access-dispatch-budget.mjs';
import { createDispatch } from './db-access-dispatch.mjs';

// A retained frame token must never return a value, omit an intermediary invocation or skip a
// dependency query that a fresh frame for the same caller would expose. The first two cases are
// the independently executed counters, unchanged.

function setup(source) {
  const model = createSourceModel(new Map([['apps/web/src/example.ts', source]]));
  const nodes = [];
  for (const sf of model.parsed.values()) model.walk(sf, item => nodes.push(item));
  const node = text => {
    const found = nodes.find(item => item.getText() === text);
    assert.ok(found, `missing node ${text}`);
    return found;
  };
  const calls = text => nodes.filter(item => ts.isCallExpression(item) && item.getText() === text);
  const identity = item => model.declaration(item) ?? item;
  const escaped = new Set();
  const mutated = new Set();
  const isMutated = item => mutated.has(identity(item));
  const memo = createDependencyMemo(escaped, identity);
  const resolver = createLocalInvocations(model, { isMutated, isEscaped: memo.isEscaped });
  // Each fresh question uses its own resolver: no frame or memo is shared with the retained one.
  function fresh(path, inner) {
    const local = createLocalInvocations(model, {
      isMutated,
      isEscaped: item => escaped.has(identity(item)),
    });
    let context;
    for (const text of path) {
      const result = local.resolveCall(node(text), context);
      assert.equal(result.unknown, false, `fresh parent ${text}: ${result.reasons}`);
      context = result.targets[0].context;
    }
    return local.resolveCall(inner, context);
  }
  function retain(path) {
    let context;
    const parents = [];
    for (const text of path) {
      const parent = memo.record(() => resolver.resolveCall(node(text), context));
      assert.equal(parent.value.unknown, false, `retained parent ${text}: ${parent.value.reasons}`);
      parents.push(parent);
      context = parent.value.targets[0].context;
    }
    return { context, parents };
  }
  const resolve = (inner, context) => memo.record(() => resolver.resolveCall(inner, context));
  return { node, calls, identity, escaped, mutated, memo, fresh, retain, resolve };
}

const summary = result => ({
  unknown: result.unknown,
  reasons: [...result.reasons],
  functions: result.functions.map(item => item.getText()),
  targets: result.targets.map(item => item.functionNode.getText()),
  intermediaries: result.targets.flatMap(item =>
    item.resolutionInvocations.map(descriptor => descriptor.functionNode.getText())
  ),
});
const deps = recorded => [...recorded.deps].map(([item, answer]) => [item.getText(), answer]);
const known = (functions, intermediaries = []) => ({
  unknown: false,
  reasons: [],
  functions,
  targets: functions,
  intermediaries,
});
const unknown = reasons => ({
  unknown: true,
  reasons,
  functions: [],
  targets: [],
  intermediaries: [],
});

test('counter 1: retained bound parameter after escape matches the fresh frame', () => {
  const s = setup('function invoke(f:any){return f();} const callable=()=>1;invoke(callable);');
  const { context, parents } = s.retain(['invoke(callable)']);
  const inner = s.node('f()');
  const before = s.resolve(inner, context);
  const again = s.resolve(inner, context);
  assert.deepEqual(summary(before.value), known(['()=>1']));
  assert.deepEqual(summary(again.value), known(['()=>1']));
  assert.deepEqual(deps(before), [
    ['f:any', false],
    ['()=>1', false],
  ]);
  assert.deepEqual(deps(again), deps(before), 'repeat resolution re-records the memoised argument');
  s.escaped.add(s.identity(s.node('()=>1')));
  assert.equal(s.memo.valid(parents[0]), true, 'the retained parent stays valid');
  assert.equal(s.memo.valid(before), false);
  assert.equal(s.memo.valid(again), false);
  const expected = unknown(['escaped:Identifier']);
  assert.deepEqual(summary(s.fresh(['invoke(callable)'], inner)), expected);
  for (let index = 0; index < 2; index++) {
    const after = s.resolve(inner, context);
    assert.deepEqual(summary(after.value), expected);
    assert.equal(s.memo.valid(after), true);
  }
});

test('counter 2: retained local factory replays its intermediary and matches fresh on escape', () => {
  const s = setup(
    'function factory(){return()=>1;} function use(){const f=factory();return f();}use();'
  );
  const { context, parents } = s.retain(['use()']);
  const inner = s.node('f()');
  const factory = 'function factory(){return()=>1;}';
  const before = s.resolve(inner, context);
  const again = s.resolve(inner, context);
  assert.deepEqual(summary(before.value), known(['()=>1'], [factory]));
  assert.deepEqual(summary(again.value), known(['()=>1'], [factory]), 'intermediary not dropped');
  assert.deepEqual(summary(s.fresh(['use()'], inner)), known(['()=>1'], [factory]));
  assert.deepEqual(deps(before), [
    ['f=factory()', false],
    ['factory()', false],
    [factory, false],
    ['()=>1', false],
  ]);
  assert.deepEqual(deps(again), deps(before));
  s.escaped.add(s.identity(s.node(factory)));
  assert.equal(s.memo.valid(parents[0]), true);
  assert.equal(s.memo.valid(again), false);
  const expected = unknown(['escaped:Identifier', 'unsupported-callee:CallExpression']);
  assert.deepEqual(summary(s.fresh(['use()'], inner)), expected);
  assert.deepEqual(summary(s.resolve(inner, context).value), expected);
});

test('transitive const aliases of a retained parameter re-observe escape', () => {
  const s = setup(
    'function invoke(f:any){const g=f;const h=g;return h();} const callable=()=>1;invoke(callable);'
  );
  const { context } = s.retain(['invoke(callable)']);
  const inner = s.node('h()');
  const before = s.resolve(inner, context);
  const again = s.resolve(inner, context);
  assert.deepEqual(summary(before.value), known(['()=>1']));
  assert.deepEqual(summary(again.value), summary(before.value));
  assert.deepEqual(deps(again), deps(before));
  assert.ok(deps(before).some(([text]) => text === '()=>1'));
  s.escaped.add(s.identity(s.node('()=>1')));
  assert.equal(s.memo.valid(again), false);
  const after = summary(s.resolve(inner, context).value);
  assert.deepEqual(after, summary(s.fresh(['invoke(callable)'], inner)));
  assert.equal(after.unknown, true);
  assert.match(after.reasons[0], /^escaped:/u);
});

test('nested retained parameter frames compose their dependencies', () => {
  const s = setup(
    'function outer(f:any){return inner(f);} function inner(g:any){return g();} const callable=()=>1; outer(callable);'
  );
  const path = ['outer(callable)', 'inner(f)'];
  const { context, parents } = s.retain(path);
  const call = s.node('g()');
  const before = s.resolve(call, context);
  const again = s.resolve(call, context);
  assert.deepEqual(summary(before.value), known(['()=>1']));
  assert.deepEqual(summary(again.value), summary(before.value));
  assert.deepEqual(deps(again), deps(before), 'outer frame parameter memo is re-recorded');
  s.escaped.add(s.identity(s.node('()=>1')));
  assert.ok(
    parents.every(item => s.memo.valid(item)),
    'retained parents stay valid'
  );
  assert.equal(s.memo.valid(again), false);
  const after = summary(s.resolve(call, context).value);
  assert.deepEqual(after, summary(s.fresh(path, call)));
  assert.equal(after.unknown, true);
  assert.match(after.reasons[0], /^escaped:/u);
});

test('multiple call nodes sharing one retained frame each expose the factory intermediary', () => {
  const s = setup(
    'function factory(){return()=>1;} function use(){const f=factory();f();return f();} use();'
  );
  const { context } = s.retain(['use()']);
  const nodes = s.calls('f()');
  assert.equal(nodes.length, 2);
  const factory = 'function factory(){return()=>1;}';
  for (const item of [nodes[0], nodes[1], nodes[1], nodes[0]])
    assert.deepEqual(summary(s.resolve(item, context).value), known(['()=>1'], [factory]));
  s.escaped.add(s.identity(s.node(factory)));
  const expected = unknown(['escaped:Identifier', 'unsupported-callee:CallExpression']);
  for (const item of [nodes[1], nodes[0]]) {
    assert.deepEqual(summary(s.fresh(['use()'], item)), expected);
    assert.deepEqual(summary(s.resolve(item, context).value), expected);
  }
});

test('retained frame re-observes a mutation answer like a fresh frame', () => {
  const s = setup('function invoke(f:any){return f();} const callable=()=>1;invoke(callable);');
  const { context } = s.retain(['invoke(callable)']);
  const inner = s.node('f()');
  assert.deepEqual(summary(s.resolve(inner, context).value), known(['()=>1']));
  s.mutated.add(s.identity(s.node('()=>1')));
  const expected = unknown(['mutated:Identifier']);
  assert.deepEqual(summary(s.fresh(['invoke(callable)'], inner)), expected);
  assert.deepEqual(summary(s.resolve(inner, context).value), expected);
});

test('self-returning allocation identity holds within one resolution and across resolutions', () => {
  const s = setup(
    'function make(){const c={chain(){return c;},select(){return 1;}};return c;} function use(){const m=make();return m.chain().chain().select();} use();'
  );
  const { context } = s.retain(['use()']);
  const inner = s.node('m.chain().chain().select()');
  const make = 'function make(){const c={chain(){return c;},select(){return 1;}};return c;}';
  const expected = known(
    ['select(){return 1;}'],
    [make, 'chain(){return c;}', 'chain(){return c;}']
  );
  for (let index = 0; index < 2; index++) {
    const result = s.resolve(inner, context).value;
    assert.deepEqual(summary(result), expected);
    const [target] = result.targets;
    const chains = target.resolutionInvocations.filter(item =>
      item.functionNode.getText().startsWith('chain')
    );
    assert.equal(chains[0].definingContext, chains[1].definingContext, 'same allocation frame');
    assert.equal(target.definingContext, chains[0].definingContext);
  }
  assert.deepEqual(summary(s.fresh(['use()'], inner)), expected);
});

function dispatchFixture(source) {
  const model = createSourceModel(new Map([['apps/web/src/example.ts', source]]));
  const dispatch = createDispatch(model, { isMutated: () => false, canonical: () => false });
  const nodes = [];
  for (const sf of model.parsed.values())
    model.walk(sf, item => {
      if (ts.isCallExpression(item)) nodes.push(item);
    });
  return { dispatch, calls: text => nodes.filter(item => item.getText() === text) };
}
const LATER = 'declare function later(x:unknown):void;';
const RUN = 'function run(fn){fn();fn();}';
const LEAK = 'function leak(x){later(x);}';

// Test input, not prior proof: the retained run frame is resolved before or after leak marks f
// escaped; later rounds must not resurrect f through the retained frame or the dispatch cache.
for (const [label, source] of [
  ['run body before leak body', `${LATER}${RUN}${LEAK}const f=()=>1;run(f);leak(f);`],
  ['leak body before run body', `${LATER}${LEAK}${RUN}const f=()=>1;leak(f);run(f);`],
])
  test(`dispatch retained frame does not resurrect an escaped callable: ${label}`, () => {
    const { dispatch, calls } = dispatchFixture(source);
    const state = dispatch.state();
    assert.equal(state.settled, true, String([...state.reasons]));
    const nodes = calls('fn()');
    assert.equal(nodes.length, 2);
    for (const item of nodes) {
      const variants = dispatch.variants(item);
      assert.ok(variants.length >= 1);
      for (const variant of variants) {
        assert.equal(variant.unknown, true, JSON.stringify(variant.reasons));
        assert.deepEqual(variant.targets, []);
        assert.ok(
          variant.reasons.some(reason => /^escaped:/u.test(reason)),
          variant.reasons
        );
      }
    }
  });

test('dispatch control without the leak keeps the retained frame target known', () => {
  const { dispatch, calls } = dispatchFixture(`${RUN}const f=()=>1;run(f);`);
  const state = dispatch.state();
  assert.equal(state.settled, true, String([...state.reasons]));
  for (const item of calls('fn()')) {
    const variants = dispatch.variants(item);
    assert.ok(variants.length >= 1);
    for (const variant of variants) {
      assert.equal(variant.unknown, false, String(variant.reasons));
      assert.deepEqual(
        variant.targets.map(target => target.functionNode.getText()),
        ['()=>1']
      );
    }
  }
});
