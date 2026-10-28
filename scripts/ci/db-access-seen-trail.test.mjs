import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appendSeenTrail } from './db-access-seen-trail.mjs';
const native = (seen, value) => new Set(seen).add(value);
const values = [{}, {}, NaN, -0, 0, undefined, null, Symbol('a'), 'a', 1, 1n, true];
function equal(actual, expected) {
  assert.equal(actual.size, expected.size);
  assert.deepEqual([...actual], [...expected]);
  assert.deepEqual([...new Set(actual)], [...expected]);
  for (const value of values) assert.equal(actual.has(value), expected.has(value));
}
test('SameValueZero, AST object identity, duplicates and insertion order', () => {
  let a = new Set(),
    b = new Set();
  for (const value of [...values, ...values.slice().reverse()]) {
    a = appendSeenTrail(a, value);
    b = native(b, value);
    equal(a, b);
  }
  assert.equal(Object.is([...appendSeenTrail(new Set(), -0)][0], -0), false);
});
test('native input snapshot, sibling isolation and native Set interoperability', () => {
  const input = new Set(values.slice(0, 3));
  const left = appendSeenTrail(input, 'left');
  const right = appendSeenTrail(left, 'right');
  input.clear();
  input.add('mutated');
  assert.deepEqual([...left], [...values.slice(0, 3), 'left']);
  assert.equal(left.has('right'), false);
  const nativeCopy = new Set(right);
  nativeCopy.add('native-only');
  assert.equal(right.has('native-only'), false);
  const back = appendSeenTrail(nativeCopy, 'back');
  nativeCopy.clear();
  assert.deepEqual([...back], [...values.slice(0, 3), 'left', 'right', 'native-only', 'back']);
  assert.throws(() => {
    left.size = 0;
  }, TypeError);
});
test('deterministic mixed native/trail branching histories', () => {
  const a = [new Set()],
    b = [new Set()];
  let state = 12345;
  const random = n => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % n;
  for (let i = 0; i < 1200; i++) {
    const parent = random(a.length),
      value = values[random(values.length)];
    a.push(i % 7 ? appendSeenTrail(a[parent], value) : native(a[parent], value));
    b.push(native(b[parent], value));
    equal(a.at(-1), b.at(-1));
    equal(a[parent], b[parent]);
  }
});
// Execute the exact tenantHandle function body, not a reimplementation of its traversal.
const production = readFileSync(new URL('./db-access-provenance.mjs', import.meta.url), 'utf8');
const start = production.indexOf('  function tenantHandle(');
const end = production.indexOf('  function parameterHandle(', start);
assert.ok(start >= 0 && end > start, 'Expected production tenantHandle function boundaries');
const body = production.slice(start, end);
const appendExpression = 'seen = appendSeenTrail(seen, node);';
assert.equal(body.split(appendExpression).length - 1, 1, 'Expected exactly one trail append');
assert.equal(body.includes('seen = new Set(seen).add(node);'), false);
const nativeBody = body.replace(appendExpression, 'seen = new Set(seen).add(node);');
const kindNames = [
  'AwaitExpression',
  'BinaryExpression',
  'PropertyAccessExpression',
  'ElementAccessExpression',
  'ObjectLiteralExpression',
  'PropertyAssignment',
  'ShorthandPropertyAssignment',
  'SpreadAssignment',
  'ArrayLiteralExpression',
  'SpreadElement',
  'ConditionalExpression',
  'BindingElement',
  'VariableDeclaration',
  'ForOfStatement',
  'Parameter',
];
const ts = Object.fromEntries(kindNames.map(name => ['is' + name, n => n?.kind === name]));
ts.SyntaxKind = Object.fromEntries(
  [
    'CommaToken',
    'BarBarToken',
    'AmpersandAmpersandToken',
    'QuestionQuestionToken',
    'EqualsToken',
  ].map(n => [n, n])
);
function run(node, proposed, seed = new Set(), remaining = 2048, fuel = 131072) {
  const visits = [],
    budget = { remaining },
    work = {
      enter() {
        visits.push('enter');
        return --fuel >= 0;
      },
    };
  const handleUnion = xs => (xs.includes(true) ? true : xs.includes('unknown') ? 'unknown' : false);
  const factory = new Function(
    'unwrap',
    'work',
    'UNKNOWN',
    'provenance',
    'ts',
    'handleUnion',
    'isMutated',
    'model',
    'parameterHandle',
    'appendSeenTrail',
    (proposed ? body : nativeBody) + '\nreturn tenantHandle;'
  );
  const fn = factory(
    x => x,
    work,
    'unknown',
    n => {
      visits.push(n);
      return n.tenant ? 'tenant-context' : 'unknown';
    },
    ts,
    handleUnion,
    n => Boolean(n.mutated),
    { declaration: n => n.declaration },
    () => 'unknown',
    appendSeenTrail
  );
  const result = fn(node, seed, budget);
  return { result, remaining: budget.remaining, fuel, visits };
}
function compare(node, seed, remaining, fuel) {
  assert.deepEqual(run(node, true, seed, remaining, fuel), run(node, false, seed, remaining, fuel));
}
test('exact tenantHandle cycles, shared siblings, depth64/65, and handle/root fuel boundaries', () => {
  const leaf = { kind: 'Identifier' },
    tenant = { kind: 'Identifier', tenant: true };
  const cycle = { kind: 'AwaitExpression' };
  cycle.expression = cycle;
  const shared = { kind: 'ConditionalExpression', whenTrue: leaf, whenFalse: leaf };
  const binary = {
    kind: 'BinaryExpression',
    operatorToken: { kind: 'BarBarToken' },
    left: cycle,
    right: tenant,
  };
  for (const node of [undefined, leaf, tenant, cycle, shared, binary])
    for (const fuel of [0, 1, 2, 131072])
      for (const remaining of [0, 1, 2, 2048]) compare(node, new Set(), remaining, fuel);
  for (const depth of [63, 64, 65, 66, 100]) {
    let node = tenant;
    for (let i = 0; i < depth; i++) node = { kind: 'AwaitExpression', expression: node };
    compare(node);
  }
  const wide = {
    kind: 'ArrayLiteralExpression',
    elements: Array.from({ length: 2100 }, () => ({ kind: 'Identifier' })),
  };
  compare(wide);
  for (const size of [64, 65, 66])
    compare(tenant, new Set(Array.from({ length: size }, () => ({}))));
});
