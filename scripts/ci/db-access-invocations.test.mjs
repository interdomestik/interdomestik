import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel, unwrap } from './db-access-source.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';

const FILE = 'apps/web/src/lib/sample.ts';
const LIB = { 'apps/web/src/lib/lib.ts': 'export function f() { return 1; }' };
const BIND = { candidate: true, callOnly: true };
const never = () => false;

// Explicit deterministic callbacks isolate the standalone mechanism. collectMutationEffects wiring
// is stage 3. No fixture code is executed.
function setup(source, options = {}) {
  const { file = FILE, files = {}, isMutated = never, isEscaped = never, maxSteps } = options;
  const model = createSourceModel(new Map([...Object.entries(files), [file, source]]));
  assert.ok(model.parsed.has(file), `createSourceModel must parse ${file}`);
  const resolver = createLocalInvocations(model, { isMutated, isEscaped, maxSteps });
  const find = text => {
    const sf = model.parsed.get(file);
    const last = sf.statements.filter(ts.isExpressionStatement).at(-1);
    let found = text ? undefined : last?.expression;
    if (text)
      model.walk(sf, node => {
        if (!found && ts.isCallExpression(node) && node.getText() === text) found = node;
      });
    assert.ok(found && ts.isCallExpression(found), `missing call ${text ?? '(last statement)'}`);
    return found;
  };
  return { resolver, find };
}

function assertTarget(resolver, call, prefix) {
  const result = resolver.resolveCall(call);
  assert.deepEqual(Object.keys(result).sort(), ['functions', 'reasons', 'targets', 'unknown']);
  assert.equal(result.unknown, false, `${call.getText()}: ${result.reasons}`);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.functions.length, 1);
  const [fn] = result.functions;
  assert.ok(fn.getText().startsWith(prefix), `${call.getText()} resolved ${fn.getText()}`);
  assert.equal(result.targets.length, 1);
  const [target] = result.targets;
  assert.equal(target.functionNode, fn);
  assert.equal(target.callNode, call);
  const callee = unwrap(call.expression);
  assert.equal(target.receiverNode, ts.isIdentifier(callee) ? undefined : callee.expression);
  assert.equal(target.argumentBindings.size, fn.parameters.length);
  fn.parameters.forEach((parameter, index) =>
    assert.equal(target.argumentBindings.get(parameter), call.arguments[index])
  );
  const callable = resolver.resolveCallable(call.expression);
  assert.deepEqual(callable, { functions: [fn], unknown: false, reasons: [] });
  return target;
}

test('resolves direct, alias, own methods, property arrows, static keys, shorthand, destructuring', () => {
  const { resolver, find } = setup(`
function direct(a: number) { return a; }
const alias = direct;
const second = alias;
function helper(x: string) { return x; }
const o = {
  method(m: number) { return m; },
  arrow: (r: number) => r,
  0: (n: number) => n,
  'quoted-key': function (q: number) { return q; },
  helper,
  nested: { deep: (v: number) => v },
  ['literal']: (v: number) => v,
};
const { arrow: picked, method } = o;
const loop = { a() { return loop.b(); }, b() { return 1; } };
direct(1);
second(2);
o.method(3);
o.arrow(4);
o['arrow'](5);
o[0](6);
o['quoted-key'](7);
o.helper('h');
picked(8);
method(9);
o.nested.deep(10);
o.literal(11);
loop.a();
`);
  for (const [text, prefix] of [
    ['direct(1)', 'function direct'],
    ['second(2)', 'function direct'],
    ['o.method(3)', 'method(m'],
    ['o.arrow(4)', '(r: number) => r'],
    [`o['arrow'](5)`, '(r: number) => r'],
    ['o[0](6)', '(n: number) => n'],
    [`o['quoted-key'](7)`, 'function (q'],
    [`o.helper('h')`, 'function helper'],
    ['picked(8)', '(r: number) => r'],
    ['method(9)', 'method(m'],
    ['o.nested.deep(10)', '(v: number) => v'],
    ['o.literal(11)', '(v: number) => v'],
    ['loop.a()', 'a()'],
  ])
    assertTarget(resolver, find(text), prefix);
});

test('preserves checker shadowing; a local select property has no database meaning', () => {
  const { resolver, find } = setup(`
function select(v: number) { return v; }
function outer(w: number) {
  const select = (inner: number) => inner * 2;
  return select(w);
}
select(1);
const local = { select: (s: string) => s };
local.select('plain');
`);
  assertTarget(resolver, find('select(w)'), '(inner: number)');
  assertTarget(resolver, find('select(1)'), 'function select');
  assertTarget(resolver, find(`local.select('plain')`), '(s: string)');
});

test('retains the actual local body and exact bindings without certifying it safe', () => {
  const { resolver, find } = setup(`
import { db } from '@interdomestik/database';
const repository = {
  select: () => db.select(),
  load(tx: unknown, id: string) { return db.select(tx).where(id); },
};
export function run(tx: unknown, id: string) {
  repository.select();
  return repository.load(tx, String(id));
}
`);
  const facade = assertTarget(resolver, find('repository.select()'), '() => db.select()');
  assert.equal(facade.argumentBindings.size, 0);
  const call = find('repository.load(tx, String(id))');
  const target = assertTarget(resolver, call, 'load(tx');
  const [txParameter, idParameter] = target.functionNode.parameters;
  assert.equal(target.argumentBindings.get(txParameter), call.arguments[0]);
  assert.equal(target.argumentBindings.get(idParameter), call.arguments[1]);
  assert.ok(target.functionNode.body.getText().includes('db.select(tx)'));
  assert.equal(target.receiverNode.getText(), 'repository');
});

test('resolution budget is per public call, not a consumed lifetime', () => {
  const source = 'function f() { return 1; } const g = f; g();';
  const { resolver, find } = setup(source, { maxSteps: 2 });
  for (let round = 0; round < 3; round += 1) assertTarget(resolver, find('g()'), 'function f');
  const tight = setup(source, { maxSteps: 1 });
  const result = tight.resolver.resolveCall(tight.find('g()'));
  assert.equal(result.unknown, true);
  assert.ok(result.reasons.includes('budget-exceeded'));
});

test('consults mutation and escape callbacks along chased receivers, aliases and callables', () => {
  const source = `const base = { run(a: number) { return a; } };
const receiver = base;
const bound = receiver.run;
bound(1);`;
  const seen = new Set();
  const recording = setup(source, {
    isMutated: node => {
      seen.add(node.getText());
      return false;
    },
  });
  assertTarget(recording.resolver, recording.find('bound(1)'), 'run(a');
  for (const text of ['bound', 'receiver.run', 'receiver', 'base', 'run(a: number) { return a; }'])
    assert.ok(seen.has(text), `callback not consulted for ${text}`);
  for (const text of ['bound', 'receiver.run', 'receiver', 'base'])
    for (const [flag, reason] of [
      ['isMutated', 'mutated'],
      ['isEscaped', 'escaped'],
    ]) {
      const hit = setup(source, { [flag]: node => node.getText() === text });
      const result = hit.resolver.resolveCall(hit.find('bound(1)'));
      assert.equal(result.unknown, true, `${flag} ${text}`);
      assert.ok(
        result.reasons.some(item => item.startsWith(reason)),
        String(result.reasons)
      );
      assert.deepEqual(result.functions, []);
      assert.deepEqual(result.targets, []);
    }
});

test('requires explicit callbacks and rejects non-call input as unknown', () => {
  const model = createSourceModel(new Map([[FILE, 'function f() { return 1; } f();']]));
  assert.throws(() => createLocalInvocations(model), TypeError);
  assert.throws(() => createLocalInvocations(model, { isMutated: never }), TypeError);
  assert.throws(() => createLocalInvocations(model, { isEscaped: never }), TypeError);
  const resolver = createLocalInvocations(model, { isMutated: never, isEscaped: never });
  const result = resolver.resolveCall(model.parsed.get(FILE));
  assert.equal(result.unknown, true);
  assert.deepEqual(result.targets, []);
});

test('unresolved imported factory stays unknown identically in ordinary and test-named files', () => {
  const source = `import { getClient } from 'pg-client';
export const run = (x: unknown) => getClient().select(x);`;
  const results = ['apps/web/src/lib/ordinary.ts', 'apps/web/src/lib/hidden.test.ts'].map(file => {
    const { resolver, find } = setup(source, { file });
    return resolver.resolveCall(find('getClient().select(x)'));
  });
  assert.equal(results[0].unknown, true);
  assert.deepEqual(results[0].functions, []);
  assert.deepEqual(results[0].targets, []);
  assert.deepEqual(results[1], results[0]);
});

const NEGATIVE = [
  ['unresolved-symbol', 'missing(1);'],
  [
    'unsupported-callee',
    `import { vi } from 'vitest'; const select = vi.fn((a: number) => a); select(1);`,
  ],
  [
    'unsupported-callee',
    `import { vi } from 'vitest'; const repo = { select: vi.fn() }; repo.select();`,
  ],
  ['accessor-property', 'const o = { get f() { return () => 1; } }; o.f();'],
  ['object-spread', 'const base = { f: () => 1 }; const o = { ...base }; o.f();'],
  ['computed-key', `const k = 'f'; const o = { [k]: () => 1 }; o.f();`],
  ['dynamic-member-key', `const o = { f: () => 1 }; const k = 'f'; o[k]();`],
  ['duplicate-key', 'const o = { f: () => 1, f: () => 2 }; o.f();'],
  ['prototype-property', 'const o = { __proto__: { f: () => 1 } }; o.f();'],
  ['missing-own-property', 'const o = { a: 1 }; o.toString();'],
  [
    'unsupported-receiver',
    'class Repo { select() { return 1; } } const repo = new Repo(); repo.select();',
  ],
  ['mutable-binding', 'let g = () => 1; g();'],
  ['mutable-binding', 'var g = function () { return 1; }; g = () => 2; g();'],
  ['mutable-binding', 'let o = { f: () => 1 }; o.f();'],
  ['unsupported-destructuring', 'const o = { f: () => 1 }; const { f = () => 2 } = o; f();'],
  ['unsupported-destructuring', 'const o = { f: () => 1 }; const { ...rest } = o; rest.f();'],
  ['unsupported-destructuring', 'const o = { i: { f: () => 1 } }; const { i: { f } } = o; f();'],
  ['parameter-binding', 'export function run(cb: () => void) { cb(); }', { call: 'cb()' }],
  ['cross-module-binding', `import { f } from './lib'; f();`, { files: LIB }],
  ['unsupported-receiver', `const mod = await import('./lib'); mod.f();`, { files: LIB }],
  ['unsupported-receiver', 'const c = await Promise.resolve({ f: () => 1 }); c.f();'],
  ['optional-chain', 'const o = { f: () => 1 }; o?.f();'],
  [
    'unsupported-callee',
    'declare const flag: boolean; function a() { return 1; } const g = flag ? a : a; g();',
  ],
  ['this-dependent', 'const o = { n: 1, f() { return this.n; } }; o.f();', { candidate: true }],
  ['arity-mismatch', 'function f(a: number) { return a; } f();', BIND],
  ['arity-mismatch', 'function f(a: number) { return a; } f(1, 2);', BIND],
  ['unsupported-parameter', 'function f(a = 1) { return a; } f(2);', BIND],
  ['unsupported-parameter', 'function f(...a: number[]) { return a; } f(1);', BIND],
  ['unsupported-parameter', 'function f({ a }: { a: number }) { return a; } f({ a: 1 });', BIND],
  [
    'spread-argument',
    'function f(a: number) { return a; } const xs = [1] as [number]; f(...xs);',
    BIND,
  ],
  ['cycle', 'const a: () => void = b; const b: () => void = a; a();'],
  ['cycle', 'const o: { f: () => void } = { f: o.f }; o.f();'],
  [
    'budget-exceeded',
    'function f() { return 1; } const a = f; const b = a; const c = b; c();',
    { maxSteps: 3 },
  ],
  [
    'mutated',
    'function f() { return 1; } const alias = f; const outer = alias; outer();',
    { isMutated: node => node.getText() === 'alias' },
  ],
  [
    'escaped',
    'const o = { f: () => 1 }; const r = o; r.f();',
    { isEscaped: node => node.getText() === 'o' },
  ],
];

for (const [reason, source, extra = {}] of NEGATIVE) {
  test(`stays unknown (${reason}): ${source}`, () => {
    const { resolver, find } = setup(source, extra);
    const call = find(extra.call);
    const result = resolver.resolveCall(call);
    assert.equal(result.unknown, true);
    assert.deepEqual(result.targets, []);
    assert.ok(
      result.reasons.some(item => item.startsWith(reason)),
      String(result.reasons)
    );
    assert.equal(result.functions.length, extra.candidate ? 1 : 0);
    if (!extra.callOnly) assert.equal(resolver.resolveCallable(call.expression).unknown, true);
  });
}
