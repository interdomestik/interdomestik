import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { CANONICAL_FILES } from './db-access-graph-jsx-fixture.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { createGraphTraversal } from './db-access-graph-core.mjs';
import { mergeOwnedGraphs, encodeInventory, hydrateInventory } from './db-access-graph-workers.mjs';
function setup(files, cold = false) {
  const trusted = new Map(CANONICAL_FILES),
    model = createSourceModel(new Map([...trusted, ...files]), trusted),
    provenance = createProvenance(model);
  const inventory = collectInventory(model, cold ? createProvenance(model) : provenance, trusted);
  return { model, provenance, inventory };
}
const publicGraph = g => ({
  failures: g.failures.map(row =>
    Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')))
  ),
  incomplete: g.incomplete,
  incompleteRawCount: g.incompleteRawCount,
  reachedTestSources: [...g.reachedTestSources],
});
const files = [
  ['apps/web/src/a.ts', "import './helper.test'; import {pick} from './shared'; pick();"],
  ['apps/web/src/b.ts', "import './helper.test'; import {pick} from './shared'; pick();"],
  [
    'apps/web/src/c.ts',
    "import {db} from '@interdomestik/database'; const indirect=db.select; indirect();",
  ],
  ['apps/web/src/d.ts', "import './helper.test'; import {pick} from './shared'; pick();"],
  [
    'apps/web/src/helper.test.ts',
    "import {db} from '@interdomestik/database'; export const holder={run(){db.select();}}; holder.run(); opaque(db);",
  ],
  [
    'apps/web/src/shared.ts',
    "import {db} from '@interdomestik/database'; export function pick(){const shared={db}; return shared.db.select();} function recurse(){recurse();} recurse();",
  ],
  [
    'apps/web/src/deep.ts',
    Array.from(
      { length: 55 },
      (_, i) => `function f${i}(){${i < 54 ? 'f' + (i + 1) + '();' : ''}}`
    ).join('') + 'f0();',
  ],
];
function compare() {
  const serial = setup(files),
    initial = [...serial.provenance.analysisUnknown];
  const expected = publicGraph(
    inspectChangedEdges(serial.model, serial.provenance, serial.inventory)
  );
  const wire = encodeInventory(serial),
    partitions = [...serial.inventory.changed].map(f => [f]),
    workers = [setup(files, true), setup(files, true)];
  const sessions = workers.map(worker => {
    worker.inventory = hydrateInventory(worker.model, wire);
    for (const reason of initial) worker.provenance.analysisUnknown.add(reason);
    return createGraphTraversal(worker.model, worker.provenance, worker.inventory);
  });
  const results = partitions.map((origins, index) => ({
    ...publicGraph(sessions[index % 2].run(origins)),
    origins,
    jobId: index,
  }));
  const prepared = {
    ...serial,
    provenance: { ...serial.provenance, analysisUnknown: new Set(initial) },
  };
  assert.deepEqual(publicGraph(mergeOwnedGraphs(prepared, partitions, results)), expected);
  assert.ok(expected.failures.length > 0);
  assert.ok(expected.incompleteRawCount > 0);
  assert.ok(expected.reachedTestSources.length > 0);
  assert.ok(expected.incomplete.some(row => row.reason === 'recursive executable edge'));
  assert.ok(expected.incomplete.some(row => row.reason === 'graph bound exceeded'));
  assert.throws(() => sessions[0].run(partitions[0]), /invalid graph session origins/);
  return {
    roots: partitions.length,
    failures: expected.failures.length,
    diagnosticRows: expected.incomplete.length,
    occurrences: expected.incompleteRawCount,
  };
}
test('actual serial graph equals alternating persistent sessions over complete ordered manual batches', () => {
  console.log(JSON.stringify(compare()));
});
test('actual shared provenance fuel bound is unknown and later root recovers, before or after persistent batch', () => {
  const file = 'apps/web/src/fuel.ts';
  const aliases = Array.from(
    { length: 60 },
    (_, i) => `const a${i}=${i ? 'a' + (i - 1) : 'db'};`
  ).join('');
  const source =
    'import {db} from "@interdomestik/database";' +
    aliases +
    'function take(x){const target=x;}' +
    Array(2040).fill('take(a59);').join('') +
    'const targetReset=db;';
  const input = [
    [file, source],
    ['apps/web/src/empty-a.ts', 'export const a=1;'],
    ['apps/web/src/empty-b.ts', 'export const b=2;'],
  ];
  function run(priorBatch) {
    const state = setup(input, true);
    let target, reset;
    state.model.walk(state.model.parsed.get(file), node => {
      if (node.name?.getText() === 'target') target = node.initializer;
      if (node.name?.getText() === 'targetReset') reset = node.initializer;
    });
    const session = createGraphTraversal(state.model, state.provenance, state.inventory);
    if (priorBatch) session.run(['apps/web/src/empty-a.ts']);
    const answer = state.provenance.tenantHandle(target),
      after = state.provenance.provenance(reset),
      unknown = [...state.provenance.analysisUnknown];
    const later = session.run(['apps/web/src/empty-b.ts']);
    return { answer, after, unknown, later: publicGraph(later) };
  }
  const baseline = run(false),
    warm = run(true);
  assert.deepEqual(warm, baseline);
  assert.equal(warm.answer, 'unknown');
  assert.equal(warm.after, 'db');
  assert.ok(warm.unknown.includes('provenance-work-bound'));
});

test('129 actual roots retain exact order across 64-origin batches and persistent session reuse', () => {
  const input = Array.from({ length: 129 }, (_, index) => [
    `apps/web/src/batch-${String(index).padStart(3, '0')}.ts`,
    `import { db } from '@interdomestik/database'; db.select(); opaque${index}();`,
  ]);
  const serial = setup(input);
  const initial = [...serial.provenance.analysisUnknown];
  const expected = publicGraph(
    inspectChangedEdges(serial.model, serial.provenance, serial.inventory)
  );
  const roots = [...serial.inventory.changed];
  const batches = [roots.slice(0, 64), roots.slice(64, 128), roots.slice(128)];
  const wire = encodeInventory(serial);
  const sessions = [0, 1].map(() => {
    const worker = setup(input, true);
    worker.inventory = hydrateInventory(worker.model, wire);
    for (const reason of initial) worker.provenance.analysisUnknown.add(reason);
    return createGraphTraversal(worker.model, worker.provenance, worker.inventory);
  });
  const results = batches.map((origins, jobId) => ({
    ...publicGraph(sessions[jobId % 2].run(origins)),
    origins,
    jobId,
  }));
  assert.equal(roots.length, 129);
  assert.deepEqual(
    publicGraph(
      mergeOwnedGraphs(
        { ...serial, provenance: { ...serial.provenance, analysisUnknown: new Set(initial) } },
        batches,
        results
      )
    ),
    expected
  );
  assert.ok(expected.failures.length >= 129);
});
