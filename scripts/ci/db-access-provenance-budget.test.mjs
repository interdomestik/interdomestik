import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { CANONICAL_FILES, graphProbe } from './db-access-graph-jsx-fixture.mjs';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const FILE = 'apps/web/src/dag.ts';
const BOUND_REASON = 'provenance-work-bound';

// Two syntax callers at every level form 2^depth provenance paths through a tiny acyclic source.
// All callers agree on db: returning UNKNOWN must be caused by work exhaustion, not ambiguity.
function callerDag(depth) {
  const lines = [
    'import { db } from "@interdomestik/database";',
    'function leaf(value) { return value; }',
  ];
  let previous = 'leaf';
  for (let index = 0; index < depth; index++) {
    const name = `level${index}`;
    lines.push(`function ${name}(value) { ${previous}(value); ${previous}(value); }`);
    previous = name;
  }
  lines.push(`${previous}(db);`);
  return lines.join('\n');
}

function probeSource(text) {
  const model = createSourceModel(new Map([...CANONICAL_FILES, [FILE, text]]));
  const provenance = createProvenance(model);
  const source = model.parsed.get(FILE);
  let leaf;
  model.walk(source, node => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === 'leaf'
    )
      leaf = node;
  });
  const returned = leaf.body.statements[0].expression;
  const direct = source.statements.at(-1).expression.arguments[0];
  let declarations = 0;
  const declaration = model.declaration;
  model.declaration = node => {
    declarations += 1;
    return declaration(node);
  };
  return { provenance, returned, direct, declarations: () => declarations };
}

const probe = depth => probeSource(callerDag(depth));

test('shared caller DAG exhausts one value budget through contextual to legacy fallback', () => {
  const { provenance, returned, direct, declarations } = probe(20);
  assert.equal(provenance.provenance(returned), 'unknown');
  assert.ok(provenance.analysisUnknown.has(BOUND_REASON));
  assert.ok(declarations() < 50000, `shared work was not bounded: ${declarations()}`);
  // Exhaustion is sticky evidence, not a permanently exhausted budget for subsequent roots.
  assert.equal(provenance.provenance(direct), 'db');
  assert.ok(provenance.analysisUnknown.has(BOUND_REASON));
});

test('handle budget includes its nested value, parameter, argument and lifetime work', () => {
  const { provenance, returned, declarations } = probe(20);
  assert.equal(provenance.tenantHandle(returned), 'unknown');
  assert.ok(provenance.analysisUnknown.has(BOUND_REASON));
  assert.ok(declarations() < 50000, `nested value traversal reset the budget: ${declarations()}`);
});

test('small shared DAG preserves the proven value and no-handle answer without exhaustion', () => {
  const { provenance, returned } = probe(2);
  assert.equal(provenance.provenance(returned), 'db');
  assert.equal(provenance.tenantHandle(returned), false);
  assert.equal(provenance.analysisUnknown.has(BOUND_REASON), false);
});

test('fuel exhaustion remains incomplete and cannot hide another changed source ambient operation', () => {
  const root = createTempRepo();
  writeFixture(root, FILE, callerDag(15));
  const unsafe = 'apps/web/src/unsafe.ts';
  writeFixture(
    root,
    unsafe,
    'import {db} from "@interdomestik/database"; export function unsafe(){db.select();}'
  );
  const result = runGuard(root);
  assert.equal(result.status, 1, result.stderr);
  const report = readReport(root);
  assert.equal(report.status, 'incomplete');
  assert.ok(report.incomplete.some(item => item.reason === BOUND_REASON));
  assert.ok(
    report.failingNewEntries.some(item => item.file === unsafe && item.callee === 'db.select')
  );
});

test('caller joins require agreement and remain unknown for every caller order', () => {
  for (const args of ['db, dbRls', 'dbRls, db', '{}, db', 'db, {}']) {
    const text = [
      'import {db, dbRls} from "@interdomestik/database";',
      'function leaf(value) { return value; }',
      ...args.split(', ').map(value => `leaf(${value});`),
    ].join('\n');
    const { provenance, returned } = probeSource(text);
    assert.equal(provenance.provenance(returned), 'unknown', args);
    assert.equal(provenance.analysisUnknown.has(BOUND_REASON), false, args);
  }
});

test('exhausted adoption classification cannot silently remove prior scoped-control obligations', () => {
  const root = createTempRepo();
  writeFixture(root, FILE, callerDag(15));
  sealFixture(root);
  writeFixture(root, FILE, 'export function leaf() { return null; }');
  const result = runGuard(root);
  assert.equal(result.status, 1, result.stderr);
  const report = readReport(root);
  assert.equal(report.status, 'incomplete');
  assert.deepEqual(report.incomplete, [
    { file: '<adoption-analysis>', reason: 'dispatch-entry-bound', occurrences: 1 },
    { file: '<adoption-analysis>', reason: BOUND_REASON, occurrences: 1 },
  ]);
  assert.equal(report.incompleteRawCount, 2);
});

test('fuel exhaustion overrides an earlier known tenant handle instead of returning true', () => {
  const text = [
    'import {withTenantContext} from "@interdomestik/database";',
    'withTenantContext("tenant", function leaf(tx) {',
    `return [tx, () => { ${'0;'.repeat(65536)} }];`,
    '});',
  ].join('\n');
  const { provenance, returned } = probeSource(text);
  assert.equal(provenance.tenantHandle(returned.elements[0]), true);
  assert.equal(provenance.tenantHandle(returned), 'unknown');
  assert.ok(provenance.analysisUnknown.has(BOUND_REASON));
  assert.equal(provenance.tenantHandle(returned.elements[0]), true);
});

test('repeated diagnostics retain distinct keys and first order without allocating repeated entries', () => {
  const diagnostics = createIncompleteCollector();
  diagnostics.push({ file: 'one.ts', reason: 'unknown' });
  const first = diagnostics.entries[0];
  diagnostics.push({ file: 'two.ts', reason: 'unknown' });
  diagnostics.push({ file: 'one.ts', reason: 'other' });
  for (let index = 0; index < 1350000; index++)
    diagnostics.push({ file: 'one.ts', reason: 'unknown' });
  assert.equal(diagnostics.entries.length, 3);
  assert.equal(diagnostics.entries[0], first);
  assert.equal(first.occurrences, 1350001);
  assert.equal(diagnostics.rawCount, 1350003);
  assert.deepEqual(diagnostics.entries.slice(1), [
    { file: 'two.ts', reason: 'unknown', occurrences: 1 },
    { file: 'one.ts', reason: 'other', occurrences: 1 },
  ]);
});

test('graph compacts identical diagnostics when emitted and preserves their raw occurrence count', () => {
  const count = 100;
  const result = graphProbe('', `export default function Page(){${'unknownOne();'.repeat(count)}}`);
  assert.equal(result.incomplete.length, 1);
  assert.equal(result.incomplete[0].occurrences, 2 * count);
  assert.equal(result.incompleteRawCount, 2 * count);
  assert.deepEqual(result.reasons, { 'unknown executable edge unknownOne': 2 * count });
});

test('graph reports fuel exhausted after its initial analysis snapshot', () => {
  const file = 'apps/web/src/late.ts';
  const trusted = new Map(CANONICAL_FILES);
  const sources = new Map(trusted).set(file, `opaque(() => { ${'0;'.repeat(65536)} });`);
  const model = createSourceModel(sources, trusted);
  const provenance = createProvenance(model);
  const inventory = collectInventory(model, provenance, trusted);
  assert.equal(provenance.analysisUnknown.size, 0);
  assert.equal(inventory.entries.length, 0);
  const graph = inspectChangedEdges(model, provenance, inventory);
  assert.ok(provenance.analysisUnknown.has(BOUND_REASON));
  assert.deepEqual(
    graph.incomplete.filter(item => item.reason === BOUND_REASON),
    [{ file: '<analysis>', reason: BOUND_REASON, occurrences: 1 }]
  );
  assert.ok(
    graph.incomplete.some(
      item => item.reason === 'unsupported mutated or bounded handle argument to unresolved callee'
    )
  );
});
