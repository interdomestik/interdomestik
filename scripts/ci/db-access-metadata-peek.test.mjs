import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createFrame } from './db-access-invocation-values.mjs';
import { createInvocationContexts } from './db-access-invocation-contexts.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';
import { createDispatch } from './db-access-dispatch.mjs';

function fixture(text = 'function id(x) { return x; } id(1);') {
  const model = createSourceModel(new Map([['apps/web/src/peek.ts', text]]));
  const source = model.parsed.values().next().value;
  const fn = source.statements.find(ts.isFunctionDeclaration);
  const call = source.statements.filter(ts.isExpressionStatement).at(-1).expression;
  return { model, source, fn, call };
}

test('context peek distinguishes unavailable from known empty/open bindings without creation', () => {
  const { model, source, fn, call } = fixture();
  let creates = 0;
  const contexts = createInvocationContexts(model, (...args) => {
    creates++;
    return createFrame(...args);
  });
  for (const token of [undefined, null, {}, Object.freeze({}), 1])
    assert.equal(contexts.peekBindingsFor(token), undefined);
  assert.equal(creates, 0);
  const empty = contexts.register({ node: fn }, call, undefined, new Map()).descriptor.context;
  const known = contexts.register(
    { node: fn },
    call,
    null,
    new Map([[fn.parameters[0], call.arguments[0]]])
  ).descriptor.context;
  const before = creates;
  const emptySnapshot = contexts.peekBindingsFor(empty);
  assert.deepEqual(emptySnapshot, []);
  assert(Object.isFrozen(emptySnapshot));
  const first = contexts.peekBindingsFor(known);
  assert.equal(first.length, 1);
  assert.equal(first[0].callerContext, undefined);
  assert.equal(first[0].parameter, fn.parameters[0]);
  assert.equal(first[0].argument, call.arguments[0]);
  for (let i = 0; i < 5; i++) assert.deepEqual(contexts.peekBindingsFor(known), first);
  assert.equal(creates, before);
  assert.notEqual(contexts.peekBindingsFor(known), first);
  assert.notEqual(contexts.peekBindingsFor(known)[0], first[0]);
  assert(Object.isFrozen(first) && Object.isFrozen(first[0]));
  assert.throws(() => first.push({}), TypeError);
  assert.throws(() => {
    first[0].argument = source;
  }, TypeError);
  assert.equal(Object.isFrozen(fn.parameters[0]), false);
  assert.equal(Object.isFrozen(call.arguments[0]), false);
});

for (const originalAction of ['bindingsFor', 'register']) {
  test('missing ancestor caller token stays unavailable until original ' + originalAction, () => {
    const { model, source, fn, call } = fixture();
    const contexts = createInvocationContexts(model, createFrame);
    const hiddenCaller = createFrame(source);
    const ancestor = createFrame(fn, undefined, {
      bindings: new Map([[fn.parameters[0], call.arguments[0]]]),
      callerEnv: hiddenCaller,
    });
    const { frame, descriptor } = contexts.register(
      { node: fn, env: ancestor },
      call,
      undefined,
      new Map([[fn.parameters[0], call.arguments[0]]])
    );
    const locals = new Map(frame.locals);
    // Own bindings are available, but the whole snapshot must remain unavailable.
    for (let i = 0; i < 5; i++)
      assert.equal(contexts.peekBindingsFor(descriptor.context), undefined);
    assert.deepEqual(frame.locals, locals);
    assert.equal(Object.isFrozen(frame), false);
    assert.equal(Object.isFrozen(hiddenCaller), false);
    if (originalAction === 'bindingsFor') contexts.bindingsFor(descriptor.context);
    else contexts.register({ node: fn }, call, hiddenCaller, new Map());
    const snapshot = contexts.peekBindingsFor(descriptor.context);
    assert.equal(snapshot.length, 2);
    assert.equal(snapshot[0].callerContext, undefined);
    assert(snapshot[1].callerContext);
    assert.deepEqual(contexts.peekBindingsFor(snapshot[1].callerContext), []);
    assert.deepEqual(snapshot, contexts.bindingsFor(descriptor.context));
    assert.notEqual(snapshot, contexts.bindingsFor(descriptor.context));
  });
}

test('empty ancestor bindings cannot conceal an unavailable caller environment', () => {
  const { model, source, fn, call } = fixture();
  const contexts = createInvocationContexts(model, createFrame);
  const hiddenCaller = createFrame(source);
  const ancestor = createFrame(fn, undefined, { bindings: new Map(), callerEnv: hiddenCaller });
  const { descriptor } = contexts.register({ node: fn, env: ancestor }, call, null, new Map());
  assert.deepEqual(contexts.bindingsFor(descriptor.context), []);
  for (let i = 0; i < 5; i++) assert.equal(contexts.peekBindingsFor(descriptor.context), undefined);
  contexts.register({ node: fn }, call, hiddenCaller, new Map());
  const snapshot = contexts.peekBindingsFor(descriptor.context);
  assert.deepEqual(snapshot, []);
  assert(Object.isFrozen(snapshot));
  assert.equal(Object.isFrozen(ancestor), false);
  assert.equal(Object.isFrozen(hiddenCaller), false);
});

test('resolver forwards observational reads with unchanged resolution queries and results', () => {
  const { model, fn, call } = fixture();
  const counts = { mutation: 0, escape: 0, symbol: 0 };
  const symbol = model.symbol;
  model.symbol = (...args) => {
    counts.symbol++;
    return symbol(...args);
  };
  const resolver = createLocalInvocations(model, {
    isMutated() {
      counts.mutation++;
      return false;
    },
    isEscaped() {
      counts.escape++;
      return false;
    },
  });
  const target = resolver.resolveCall(call).targets[0];
  assert(target);
  const before = { ...counts };
  const first = resolver.peekBindingsFor(target.context);
  assert.equal(first[0].parameter, fn.parameters[0]);
  assert.equal(first[0].argument, call.arguments[0]);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(resolver.peekBindingsFor(target.context), first);
    assert.equal(resolver.peekBindingsFor({}), undefined);
  }
  assert.deepEqual(counts, before);
  const next = resolver.resolveCall(call);
  assert.equal(next.unknown, false);
  assert.deepEqual(next.reasons, []);
  assert.equal(next.targets[0].functionNode, target.functionNode);
  assert.deepEqual(next.targets[0].argumentBindings, target.argumentBindings);
});

function dispatchFixture(options) {
  const f = fixture('function id(x) { return x; } const v = id(1); id(v);');
  const counts = { walk: 0, symbol: 0, declaration: 0, mutation: 0, canonical: 0, query: 0 };
  for (const key of ['walk', 'symbol', 'declaration']) {
    const original = f.model[key];
    f.model[key] = (...args) => {
      counts[key]++;
      return original(...args);
    };
  }
  const dispatch = createDispatch(
    f.model,
    {
      isMutated() {
        counts.mutation++;
        return false;
      },
      canonical() {
        counts.canonical++;
        return false;
      },
      queryBoundary() {
        counts.query++;
        return false;
      },
    },
    options
  );
  return { ...f, counts, dispatch };
}

for (const options of [undefined, { maxEntries: 1 }]) {
  test(
    'dispatch peeks do not build, reset, spend budget or alter settled/bounded state ' +
      JSON.stringify(options ?? {}),
    () => {
      const { counts, dispatch } = dispatchFixture(options);
      const unbuilt = { ...counts };
      assert.equal(dispatch.peekBindingsFor({}), undefined);
      assert.equal(dispatch.peekBindingsFor(undefined), undefined);
      assert.deepEqual(counts, unbuilt);
      const state = dispatch.state();
      const token = [...state.contexts.values()].flatMap(bucket => [...bucket.values()])[0].context;
      const snapshot = dispatch.peekBindingsFor(token);
      assert(snapshot);
      const before = { ...counts };
      const frozenState = {
        budget: state.budget,
        values: { ...state.budget },
        reasons: [...state.reasons],
        escaped: [...state.escaped],
        open: [...state.openFns],
        settled: state.settled,
        byCall: [...state.byCall],
        callers: [...state.callers],
        contexts: [...state.contexts],
      };
      for (let i = 0; i < 7; i++) {
        assert.deepEqual(dispatch.peekBindingsFor(token), snapshot);
        assert.equal(dispatch.peekBindingsFor({}), undefined);
      }
      assert.deepEqual(counts, before);
      assert.equal(dispatch.state(), state);
      assert.deepEqual(
        {
          budget: state.budget,
          values: { ...state.budget },
          reasons: [...state.reasons],
          escaped: [...state.escaped],
          open: [...state.openFns],
          settled: state.settled,
          byCall: [...state.byCall],
          callers: [...state.callers],
          contexts: [...state.contexts],
        },
        frozenState
      );
      dispatch.reset();
      const reset = { ...counts };
      assert.equal(dispatch.peekBindingsFor(token), undefined);
      assert.equal(dispatch.peekBindingsFor({}), undefined);
      assert.deepEqual(counts, reset);
      const rebuilt = dispatch.state();
      assert.notEqual(rebuilt, state);
      assert.equal(dispatch.peekBindingsFor(token), undefined);
    }
  );
}
