import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createInvocationEvidence } from './db-access-invocation-evidence.mjs';

function analyze(source, root = 'make(a)') {
  const file = 'apps/web/src/effect-correction.ts';
  const model = createSourceModel(new Map([[file, source]]));
  const calls = [];
  model.walk(model.parsed.get(file), node => {
    if (ts.isCallExpression(node)) calls.push(node);
  });
  const roots = (Array.isArray(root) ? root : [root]).map(text => {
    const call = calls.find(item => item.getText() === text);
    assert.ok(call, text);
    return { call };
  });
  return createInvocationEvidence(model).analyze(roots);
}
function values(evidence, kind) {
  return evidence.effects
    .filter(item => item.kind === kind)
    .flatMap(item => item.origins.map(origin => origin.node.getText()));
}
const a = 'const a = { select() {} }; make(a);';
for (const [label, body] of [
  ['direct capture control', 'return () => x.select();'],
  ['one const alias', 'const alias = x; return () => alias.select();'],
  [
    'multiple const aliases',
    'const first = x; const second = first; return () => second.select();',
  ],
  ['named arrow callback', 'const callback = () => x.select(); return callback;'],
  ['named declaration callback', 'function callback() { return x.select(); } return callback;'],
  [
    'named alias callback',
    'const alias = x; const callback = () => alias.select(); return callback;',
  ],
]) {
  test(`captures original actual argument through ${label}`, () => {
    const evidence = analyze(`function make(x: unknown) { ${body} } ${a}`);
    assert.ok(values(evidence, 'return').includes('a'));
    assert.equal(evidence.unknown, false, String(evidence.reasons));
  });
}
test('named delayed callback retains aliased capture on opaque forwarding', () => {
  const evidence = analyze(`declare function later(value: unknown): void;
    function make(x: unknown) { const alias = x; const callback = () => alias.select(); later(callback); } ${a}`);
  assert.ok(values(evidence, 'opaque-argument').includes('a'));
  assert.equal(evidence.unknown, true);
});
test('callback own parameters and locals do not become foreign captures', () => {
  const evidence = analyze(`function make(x: unknown) {
    return (x: unknown) => { const local = { select() {} }; return [x, local]; };
  } ${a}`);
  assert.ok(!values(evidence, 'return').includes('a'));
  assert.equal(evidence.unknown, false, String(evidence.reasons));
});
test('unresolvable captured identifiers are explicit unknown', () => {
  const evidence = analyze(`import { external } from 'opaque';
    function make(x: unknown) { return () => external.select(); } ${a}`);
  assert.equal(evidence.unknown, true);
  assert.ok(evidence.effects.some(item => item.unknown.includes('unresolved-effect-identifier')));
});
for (const expression of ['true ? x : null', 'x || null', 'x && null', 'x ?? null']) {
  test(`return alternatives preserve argument for ${expression}`, () => {
    const evidence = analyze(`function make(x: unknown) { return ${expression}; } ${a}`);
    assert.ok(values(evidence, 'return').includes('a'));
    assert.equal(evidence.unknown, false, String(evidence.reasons));
  });
}
test('conditional values nested in containment and opaque argument retain a', () => {
  const evidence = analyze(`declare function later(value: unknown): void;
    function make(x: unknown) { const box = { value: true ? x : null }; later({ value: x || null }); } ${a}`);
  assert.ok(values(evidence, 'local-containment').includes('a'));
  assert.ok(values(evidence, 'opaque-argument').includes('a'));
  assert.equal(evidence.unknown, true);
});
for (const expression of ['1', '"scalar"', 'true', 'false', 'null', '`scalar`']) {
  test(`scalar leaf ${expression} has complete empty return origins`, () => {
    const evidence = analyze(`function make(x: unknown) { return ${expression}; } ${a}`);
    assert.deepEqual(values(evidence, 'return'), []);
    assert.equal(evidence.unknown, false, String(evidence.reasons));
  });
}
for (const [label, body] of [
  ['new expression', 'return new Unknown(x);'],
  ['template substitution', 'return `${x}`;'],
  ['spread expression', 'return [...x];'],
  ['object spread', 'return { ...x };'],
  ['mutable captured alias', 'let alias = x; return () => alias.select();'],
  ['default callback parameter', 'return (y = x) => y;'],
]) {
  test(`unsupported ${label} does not silently imply complete empty effects`, () => {
    const evidence = analyze(`function make(x: unknown) { ${body} } ${a}`);
    assert.equal(evidence.unknown, true);
    assert.ok(evidence.effects.some(item => item.unknown.length));
  });
}
function aliases(length) {
  return (
    'const a0 = { select() { return 1; } };' +
    Array.from({ length }, (_, i) => `const a${i + 1} = a${i};`).join('')
  );
}
for (const length of [4, 63, 64, 65, 70]) {
  test(`mutation alias chain ${length} cannot settle as complete known dispatch`, () => {
    const evidence = analyze(
      `${aliases(length)} a${length}.select = () => 9;
      function run() { return a0.select(); } run();`,
      'run()'
    );
    assert.equal(evidence.unknown, true);
    if (length >= 64) assert.ok(evidence.reasons.includes('evidence-alias-budget'));
    else
      assert.ok(
        evidence.calls.some(item => item.reasons.some(reason => reason.startsWith('mutated:')))
      );
  });
}
for (const [label, body] of [
  [
    'forwarded write',
    'function change(x) { x.select = () => 9; } function run() { change(a70); return a0.select(); }',
  ],
  [
    'opaque escape',
    'declare function later(value: unknown): void; function run() { later(a70); return a0.select(); }',
  ],
]) {
  test(`long ${label} alias path reports propagation exhaustion`, () => {
    const evidence = analyze(`${aliases(70)} ${body} run();`, 'run()');
    assert.equal(evidence.unknown, true);
    assert.ok(evidence.reasons.includes('evidence-alias-budget'));
  });
}

test('captured aliases retain defining actual argument in both caller orders', () => {
  const source = `function make(x: unknown) {
    const alias = x; const callback = () => alias.select(); return callback;
  } const a = {}; const b = {}; make(a); make(b);`;
  for (const roots of [
    ['make(a)', 'make(b)'],
    ['make(b)', 'make(a)'],
  ]) {
    const evidence = analyze(source, roots);
    assert.equal(evidence.unknown, false, String(evidence.reasons));
    roots.forEach((root, index) => {
      const actual = root === 'make(a)' ? 'a' : 'b';
      const other = actual === 'a' ? 'b' : 'a';
      const captured = evidence.effects
        .filter(item => item.kind === 'return' && item.path.startsWith(`root:${index}/`))
        .flatMap(item => item.origins.map(origin => origin.node.getText()));
      assert.ok(captured.includes(actual));
      assert.ok(!captured.includes(other));
    });
  }
});

test('existing resolver rejects receiver capture before effect traversal', () => {
  const evidence = analyze(`function make(x: unknown) { return () => this.select(); } ${a}`);
  assert.equal(evidence.unknown, true);
  assert.ok(evidence.unresolved.some(item => item.call.getText() === 'make(a)'));
});
