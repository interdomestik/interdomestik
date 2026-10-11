import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';

function setup(source) {
  const file = 'apps/web/src/context.ts';
  const model = createSourceModel(new Map([[file, source]]));
  const calls = [];
  model.walk(model.parsed.get(file), node => {
    if (ts.isCallExpression(node)) calls.push(node);
  });
  const resolver = createLocalInvocations(model, {
    isMutated: () => false,
    isEscaped: () => false,
  });
  return { model, calls, resolver, call: text => calls.find(node => node.getText() === text) };
}

test('bound body calls preserve two actual caller allocations and reverse resolution order', () => {
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const { resolver, call } = setup(`function read(client: unknown) { return client.select(); }
const a = { select() { return 1; } }; const b = { select() { return 2; } }; read(a); read(b);`);
    const roots = ['read(a)', 'read(b)'].map(text => resolver.resolveCall(call(text)).targets[0]);
    assert.notEqual(roots[0].context, roots[1].context);
    for (const index of order) {
      const result = resolver.resolveCall(call('client.select()'), roots[index].context);
      assert.equal(result.unknown, false, String(result.reasons));
      assert.ok(result.targets[0].functionNode.getText().includes(`return ${index + 1}`));
      assert.equal(
        resolver.bindingsFor(roots[index].context)[0].argument.getText(),
        index ? 'b' : 'a'
      );
    }
    assert.equal(resolver.resolveCall(call('client.select()')).unknown, true);
  }
});

test('opaque context rejects copied tokens, another resolver/model and wrong lexical owner', () => {
  const source = 'function read(x: unknown) { return x.run(); } const a = { run() {} }; read(a);';
  const one = setup(source),
    two = setup(source);
  const target = one.resolver.resolveCall(one.call('read(a)')).targets[0];
  for (const token of [
    {},
    { ...target.context },
    two.resolver.resolveCall(two.call('read(a)')).targets[0].context,
  ]) {
    const result = one.resolver.resolveCall(one.call('x.run()'), token);
    assert.deepEqual(result.reasons, ['invalid-caller-context']);
    assert.deepEqual(result.targets, []);
  }
  assert.equal(one.resolver.resolveCall(one.call('read(a)'), target.context).unknown, true);
  assert.equal(two.resolver.resolveCall(one.call('x.run()'), target.context).unknown, true);
  assert.equal(one.resolver.bindingsFor({}), undefined);
});

test('nested closure invocation contexts retain own and captured arguments', () => {
  const { resolver, call } =
    setup(`function make(client: unknown) { return (arg: unknown) => client.select(arg); }
const a = { select(arg: unknown) { return arg; } }; const f = make(a); f(7);`);
  const target = resolver.resolveCall(call('f(7)')).targets[0];
  const result = resolver.resolveCall(call('client.select(arg)'), target.context);
  assert.equal(result.unknown, false, String(result.reasons));
  assert.equal(result.targets[0].argumentBindings.values().next().value.getText(), 'arg');
  assert.deepEqual(
    new Set(resolver.bindingsFor(target.context).map(item => item.argument.getText())),
    new Set(['a', '7'])
  );
});

test('intermediary contexts permit scanning bodies without certifying ambient calls', () => {
  const { resolver, call } = setup(`import { getClient } from 'external';
function make() { getClient().select(); return { run() {} }; } make().run();`);
  const target = resolver.resolveCall(call('make().run()')).targets[0];
  assert.equal(target.resolutionInvocations.length, 1);
  const [intermediate] = target.resolutionInvocations;
  assert.equal(
    resolver.resolveCall(call('getClient().select()'), intermediate.context).unknown,
    true
  );
});

test('mutating returned evidence maps cannot rewrite the private caller frame', () => {
  const { resolver, call } = setup(
    'function read(x: unknown) { return x.run(); } const a = { run() {} }; read(a);'
  );
  const target = resolver.resolveCall(call('read(a)')).targets[0];
  target.argumentBindings.clear();
  target.closureBindings.clear();
  assert.equal(resolver.resolveCall(call('x.run()'), target.context).unknown, false);
  assert.throws(() => resolver.bindingsFor(target.context).push({}), TypeError);
});
