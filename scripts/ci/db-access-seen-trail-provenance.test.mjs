import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createSourceModel } from './db-access-source.mjs';
import { CANONICAL_FILES } from './db-access-graph-jsx-fixture.mjs';
const baseUrl = new URL('./db-access-provenance.mjs', import.meta.url);
const requireTypeScript = (await import('node:module')).createRequire(baseUrl);
const ts = requireTypeScript('typescript');
const proposed = fs.readFileSync(baseUrl, 'utf8');
const functions = [
  ['tenantHandle', 'parameterHandle', 'node'],
  ['argumentValue', 'parameterValue', 'argument'],
  ['lexicalLifetime', 'provenance', 'use'],
  ['provenance', null, 'node'],
];
let nativeSource = proposed;
for (const [name, next, value] of functions) {
  const start = proposed.indexOf(`  function ${name}(`);
  const end = next
    ? proposed.indexOf(`  function ${next}(`, start)
    : proposed.indexOf('  const legacy =', start);
  assert.ok(start >= 0 && end > start, `Expected ${name} boundaries`);
  const expression = `seen = appendSeenTrail(seen, ${value});`;
  assert.equal(proposed.slice(start, end).split(expression).length - 1, 1);
}
for (const [value, count] of [
  ['node', 2],
  ['argument', 1],
  ['use', 1],
]) {
  const expression = `seen = appendSeenTrail(seen, ${value});`;
  assert.equal(proposed.split(expression).length - 1, count);
  nativeSource = nativeSource.replaceAll(expression, `seen = new Set(seen).add(${value});`);
}
assert.equal((proposed.match(/seen = appendSeenTrail\(/gu) ?? []).length, 4);
assert.equal(proposed.includes('seen = new Set(seen).add('), false);
let restored = nativeSource;
for (const value of ['node', 'argument', 'use']) {
  restored = restored.replaceAll(
    `seen = new Set(seen).add(${value});`,
    `seen = appendSeenTrail(seen, ${value});`
  );
}
assert.equal(restored, proposed, 'Only the four representation expressions differ');
async function load(source) {
  source = source.replace(
    /from '([^']+)'/gu,
    (_, name) =>
      `from '${name.startsWith('.') ? new URL(name, baseUrl).href : new URL('file://' + requireTypeScript.resolve(name)).href}'`
  );
  return (await import(`data:text/javascript,${encodeURIComponent(source)}`)).createProvenance;
}
const original = await load(nativeSource),
  changed = await load(proposed);
const file = 'apps/web/src/trail.ts';
function probe(factory, source, reverse = false, onlyTarget = false) {
  const trusted = new Map(CANONICAL_FILES);
  const model = createSourceModel(new Map([...trusted, [file, source]]), trusted);
  const provenance = factory(model),
    nodes = [],
    functions = [];
  model.walk(model.parsed.get(file), node => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (!onlyTarget || node.name.getText().startsWith('target'))
    )
      nodes.push(node.initializer);
    if (!onlyTarget && ts.isPropertyAccessExpression(node)) nodes.push(node.expression, node);
    if (!onlyTarget && ts.isFunctionDeclaration(node)) functions.push(node);
  });
  if (reverse) nodes.reverse();
  const key = node => (node ? `${model.fileOf(node)}:${node.pos}:${node.end}` : null);
  const results = [];
  for (let repeat = 0; repeat < 2; repeat++)
    for (const node of nodes) {
      const methods = reverse
        ? ['queryBoundary', 'tenantHandle', 'provenance']
        : ['provenance', 'tenantHandle', 'queryBoundary'];
      for (const method of methods)
        results.push([
          repeat,
          key(node),
          method,
          provenance[method](node),
          [...provenance.analysisUnknown],
        ]);
    }
  const contexts = [];
  for (const fn of functions)
    for (const context of provenance.dispatch.contextsFor(fn)) {
      const scoped = provenance.forContext(context);
      contexts.push(
        nodes.map(node => [key(node), scoped.provenance(node), scoped.tenantHandle(node)])
      );
    }
  return {
    results,
    contexts,
    unknown: [...provenance.analysisUnknown],
    mutations: provenance.mutations.size,
    unsafe: provenance.unsafeMutations.size,
    escaped: provenance.escapedFns.size,
  };
}
const prefix = 'import {db,dbRls,withTenantContext} from "@interdomestik/database";\n';
const cases = [
  prefix + 'const a=db; const b={x:a}; const c=b.x; c.select();',
  prefix +
    'function read(p){const target=p.x; return target.select();} read({x:db}); read({x:dbRls});',
  prefix +
    'function read(p){const target=p;return target.select();} withTenantContext({tenantId:"x"},tx=>read(tx)); read(db);',
  prefix +
    'withTenantContext({tenantId:"x"},tx=>{function inner(){const target=tx;return target.select();} inner();inner();});',
  prefix + 'let a=db; a=dbRls; const target=a; target.select();',
  prefix +
    'withTenantContext({tenantId:"x"},tx=>{function inner(){return tx.select();} opaque(inner);inner();});',
  prefix + 'const a=b; const b=a; const target=a; target.select();',
  prefix + 'function recurse(x){return recurse(x);} const target=recurse(db);',
  prefix +
    Array.from({ length: 68 }, (_, i) => `const a${i}=${i ? 'a' + (i - 1) : 'db'};`).join('\n') +
    'const target=a67;',
];
test('actual source/provenance modules agree across query order, fresh models, bindings, cycles, mutation and escape', () => {
  let contextualQueries = 0,
    mutations = 0,
    escapes = 0;
  for (const source of cases)
    for (const reverse of [false, true]) {
      const actual = probe(changed, source, reverse);
      const expected = probe(original, source, reverse);
      assert.deepEqual(actual, expected);
      contextualQueries += actual.contexts.length;
      mutations += actual.mutations;
      escapes += actual.escaped;
      assert.deepEqual(probe(changed, source, reverse), actual);
    }
  assert.ok(contextualQueries > 0, 'Real dispatch caller contexts must be exercised');
  assert.ok(mutations > 0, 'Actual mutation collection must be exercised');
  assert.ok(escapes > 0, 'Actual escape collection must be exercised');
});
test('actual shared root fuel exhaustion remains sticky and each later root query is fresh', () => {
  // Small AST, repeated alias-path expansion: exercise real work accounting, not altered limits.
  const aliases = Array.from(
    { length: 60 },
    (_, i) => `const a${i}=${i ? 'a' + (i - 1) : 'db'};`
  ).join('\n');
  const source =
    prefix +
    aliases +
    'function take(x){const target=x;}' +
    Array(2040).fill('take(a59);').join('') +
    'const targetReset=db;';
  const actual = probe(changed, source, false, true),
    expected = probe(original, source, false, true);
  assert.deepEqual(actual, expected);
  assert.ok(
    actual.unknown.includes('provenance-work-bound'),
    'Must actually reach unchanged131072 fuel'
  );
  assert.ok(
    actual.results.some(row => row[2] === 'provenance' && row[3] === 'db'),
    'A later root must recover its full fuel'
  );
});
