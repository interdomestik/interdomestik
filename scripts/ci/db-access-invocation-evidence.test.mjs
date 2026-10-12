import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createInvocationEvidence } from './db-access-invocation-evidence.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { scan } from './db-access-guard-test-utils.mjs';

function fixture(source, rootTexts, options, file = 'apps/web/src/evidence.ts') {
  const model = createSourceModel(new Map([[file, source]]));
  const calls = [];
  model.walk(model.parsed.get(file), node => {
    if (ts.isCallExpression(node)) calls.push(node);
  });
  const roots = rootTexts.map(text => ({ call: calls.find(node => node.getText() === text) }));
  const evidence = createInvocationEvidence(model).analyze(roots, options);
  return { model, calls, evidence };
}
const origins = (evidence, kind) =>
  evidence.effects
    .filter(item => item.kind === kind)
    .flatMap(item => item.origins.map(origin => origin.node.getText()));

test('all explicit caller alternatives survive; ordinary local methods are never canonical', () => {
  const source = `function read(client: unknown) { return client.select(); }
const a = { select() { return 1; } }; const b = { select() { return 2; } }; read(a); read(b);`;
  for (const roots of [
    ['read(a)', 'read(b)'],
    ['read(b)', 'read(a)'],
  ]) {
    const { evidence } = fixture(source, roots);
    assert.equal(evidence.unknown, false, String(evidence.reasons));
    assert.equal(evidence.settled, true);
    const selected = evidence.calls.filter(item => item.call.getText() === 'client.select()');
    assert.equal(selected.length, 2);
    assert.deepEqual(
      new Set(selected.map(item => item.targets[0].functionNode.getText())),
      new Set(['select() { return 1; }', 'select() { return 2; }'])
    );
    assert.ok(evidence.passes.length >= 2);
    assert.ok(evidence.calls.every(item => !Object.hasOwn(item, 'provenance')));
  }
});

test('caller supplies roots; a body template is not silently mounted or exempted', () => {
  const { evidence } = fixture('export function read(x: unknown) { return x.select(); }', [
    'x.select()',
  ]);
  assert.equal(evidence.unknown, true);
  assert.ok(evidence.unresolved.length);
  const empty = fixture('export function read(x: unknown) { return x.select(); }', []).evidence;
  assert.equal(empty.calls.length, 0);
  assert.equal(empty.unknown, false); // Empty requested evidence is not an evaluator approval.
});

test('captured and forwarded parameter writes reach actual source arguments', () => {
  for (const source of [
    `function change(x: unknown) { x.select = () => 3; } const a = { select() {} }; change(a);`,
    `function change(x: unknown) { x.select = () => 3; } function forward(y: unknown) { change(y); } const a = { select() {} }; forward(a);`,
    `function make(x: unknown) { return () => { x.select = () => 3; }; } const a = { select() {} }; const f = make(a); f();`,
  ]) {
    const root = source.includes('forward(a)')
      ? 'forward(a)'
      : source.includes('f();')
        ? 'f()'
        : 'change(a)';
    const { evidence } = fixture(source, [root]);
    assert.ok(origins(evidence, 'write').includes('a'), JSON.stringify(evidence.reasons));
    assert.ok(evidence.syntaxSeeds.length);
  }
});

test('local containment stays separate from opaque escape and still traces its actual argument', () => {
  const { evidence } = fixture(
    `declare function opaque(value: unknown): void;
function read(x: unknown) { const box = { x }; opaque(box); }
const a = { select() {} }; read(a);`,
    ['read(a)']
  );
  assert.ok(origins(evidence, 'local-containment').includes('a'));
  assert.ok(origins(evidence, 'opaque-argument').includes('a'));
  assert.equal(evidence.unknown, true);
});

test('returned/delayed captures remain visible without lifetime or safety certification', () => {
  const { evidence } = fixture(
    `declare function later(fn: unknown): void;
function read(x: unknown) { later(() => x.select()); return () => x.select(); }
const a = { select() {} }; read(a);`,
    ['read(a)']
  );
  assert.ok(origins(evidence, 'return').includes('a'));
  assert.ok(origins(evidence, 'opaque-argument').includes('a'));
  assert.equal(evidence.unknown, true);
});

test('ambient intermediary bodies and external factories remain unresolved', () => {
  const { evidence } = fixture(
    `import { getClient } from 'external';
function make() { getClient().select(); return { run() {} }; } make().run();`,
    ['make().run()']
  );
  assert.equal(evidence.unknown, true);
  assert.ok(
    evidence.calls.some(item => item.call.getText() === 'getClient().select()' && item.unknown)
  );
});

test('entry/round bounds and genuine recursion produce explicit unknown results', () => {
  const source = 'function leaf() {} function run() { leaf(); } run();';
  assert.ok(
    fixture(source, ['run()'], { maxEntries: 1 }).evidence.reasons.includes('evidence-entry-budget')
  );
  assert.ok(
    fixture(source, ['run()'], { maxRounds: 1 }).evidence.reasons.includes('evidence-round-budget')
  );
  const recursive = fixture('function run() { run(); } run();', ['run()']).evidence;
  assert.equal(recursive.unknown, true);
  assert.ok(recursive.reasons.includes('recursive-evidence'));
});

test('lazy adapter access does not change legacy provenance, calls, mutations or escapes', () => {
  const { model, calls } = fixture(
    'function read(x: unknown) { return x.select(); } const a = { select() {} }; read(a);',
    ['read(a)']
  );
  const legacy = createProvenance(model);
  const snapshot = () => ({
    values: calls.map(call => legacy.provenance(call.expression)),
    calls: [...legacy.calls].map(([fn, list]) => [fn, [...list]]),
    mutations: [...legacy.mutations],
    unsafe: [...legacy.unsafeMutations],
    escapes: [...legacy.escapedFns],
  });
  const before = snapshot();
  const keys = Object.keys(legacy);
  const adapter = legacy.invocationEvidence;
  assert.equal(adapter, legacy.invocationEvidence);
  adapter.analyze([{ call: calls.find(call => call.getText() === 'read(a)') }]);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(Object.keys(legacy), keys);
  assert.ok(!keys.includes('invocationEvidence'));
});

test('authenticated unchanged canonical/ambient/unknown/lifetime statuses remain unchanged', () => {
  const cases = [
    [
      'import {withTenantContext,user} from "@interdomestik/database"; export function read(){return withTenantContext({},tx=>tx.query.user.findMany());}',
      0,
      'pass',
    ],
    [
      'import {db} from "@interdomestik/database"; export function read(){return db.query.user.findMany();}',
      1,
      'incomplete',
    ],
    [
      'import {getClient} from "external-library"; export function read(){return getClient().select();}',
      1,
      'incomplete',
    ],
    [
      'import {withTenantContext} from "@interdomestik/database"; let saved; export async function read(){await withTenantContext({},tx=>{saved=tx;});return saved.query.user.findMany();}',
      1,
      'incomplete',
    ],
  ];
  for (const [source, exit, status] of cases) {
    const { result, report } = scan(source);
    assert.equal(result.status, exit, result.stderr);
    assert.equal(report.status, status, JSON.stringify(report));
  }
});

test('Stage3B promotes only fully covered mixed canonical and local caller alternatives', () => {
  const source =
    'import {withTenantContext} from "@interdomestik/database"; function read(x){return x.select();} export function run(){withTenantContext({},tx=>read(tx));return read({select(){return 1;}});}';
  const { result, report } = scan(source);
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.incomplete, []);
  const entry = report.newEntries.find(item => item.callee === 'x.select');
  assert.ok(entry, JSON.stringify(report));
  assert.equal(entry.tenantPosture, 'covered-dispatch-alternatives');
  assert.notEqual(entry.tenantPosture, 'tenant-context');
  assert.deepEqual(
    new Set(entry.dispatchAlternatives.map(item => item.kind)),
    new Set(['canonical-tx', 'source-local'])
  );
});

test('alias writes and replacement remain unresolved before local dispatch can be trusted', () => {
  for (const write of ['b.select = () => 9;', 'b = { select() { return 9; } };']) {
    const { evidence } = fixture(
      `function read(client: unknown) { return client.select(); }
const a = { select() { return 1; } }; const b = a; ${write} read(a);`,
      ['read(a)']
    );
    assert.equal(evidence.unknown, true, write);
    assert.ok(evidence.calls.some(item => item.unknown));
    assert.equal(evidence.syntaxSeeds.length, 1);
  }
});

test('opaque caller alternative is retained alongside resolved local alternative', () => {
  const { evidence } = fixture(
    `import { getClient } from 'external';
function read(client: unknown) { return client.select(); }
const a = { select() { return 1; } }; read(a); read(getClient());`,
    ['read(a)', 'read(getClient())']
  );
  const reads = evidence.calls.filter(item => item.call.getText() === 'client.select()');
  assert.equal(reads.length, 2);
  assert.ok(reads.some(item => !item.unknown));
  assert.ok(reads.some(item => item.unknown));
  assert.equal(evidence.unknown, true);
});

test('repeated captured references are not an effect recursion cycle', () => {
  const { evidence } = fixture(
    `declare function opaque(value: unknown): void;
function read(x: unknown) { const box = { a: x, b: x }; opaque(box); }
const a = {}; read(a);`,
    ['read(a)']
  );
  assert.ok(!evidence.effects.some(item => item.unknown.includes('effect-cycle')));
  assert.ok(origins(evidence, 'opaque-argument').includes('a'));
});

test('evidence arrays are read-only and callsFor retains intermediate bodies', () => {
  const { model, evidence } = fixture('function make() { return { run() {} }; } make().run();', [
    'make().run()',
  ]);
  const fn = model.parsed.values().next().value.statements[0];
  assert.ok(evidence.callsFor(fn).length);
  for (const array of [
    evidence.calls,
    evidence.effects,
    evidence.unresolved,
    evidence.passes,
    evidence.reasons,
    evidence.syntaxSeeds,
    evidence.callsFor(fn),
  ])
    assert.throws(() => array.push({}), TypeError);
  assert.equal(evidence.scope, 'supplied-roots-only');
  assert.equal(evidence.rootCount, 1);
});

test('forwarding and returned actual bindings remain effect evidence without canonical labels', () => {
  const { evidence } = fixture(
    `function forward(x: unknown) { return x; }
function read(y: unknown) { return forward(y); }
const a = {}; read(a);`,
    ['read(a)']
  );
  assert.equal(evidence.unknown, false, String(evidence.reasons));
  assert.ok(origins(evidence, 'return').includes('a'));
  assert.ok(evidence.calls.some(item => item.call.getText() === 'forward(y)' && !item.unknown));
});

test('unknown factory evidence is identical for ordinary and hidden.test filenames', () => {
  const source =
    "import { getClient } from 'external'; function read(x: unknown) { return x.select(); } read(getClient());";
  const results = ['apps/web/src/plain.ts', 'apps/web/src/hidden.test.ts'].map(
    file => fixture(source, ['read(getClient())'], undefined, file).evidence
  );
  assert.ok(results.every(result => result.unknown));
  assert.deepEqual(results[0].reasons, results[1].reasons);
  assert.deepEqual(
    results[0].calls.map(item => [item.unknown, item.reasons]),
    results[1].calls.map(item => [item.unknown, item.reasons])
  );
});
