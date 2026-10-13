import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createGraphProvenance } from './db-access-graph-provenance.mjs';
import { createProvenanceBudget } from './db-access-provenance-budget.mjs';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import {
  CANONICAL_FILES,
  CHAIN,
  PAGE,
  sharedCallerModels,
} from './db-access-graph-jsx-fixture.mjs';

// Differential oracle: the identical graph implementation with only its facade memo bypassed.
// No production flag or policy seam is added, and all traversal/limits/diagnostics remain real.
const graphUrl = new URL('./db-access-graph.mjs', import.meta.url);
const graphSource = fs.readFileSync(graphUrl, 'utf8');
const memoLine = 'const forContext = createGraphProvenance(provenance);';
assert.equal(graphSource.split(memoLine).length, 2);
const uncachedSource = graphSource
  .replace(
    memoLine,
    'const forContext = context => provenance.forContext?.(context) ?? provenance;'
  )
  .replace(
    /from '([^']+)'/gu,
    (_, name) =>
      `from '${name.startsWith('.') ? new URL(name, graphUrl).href : import.meta.resolve(name)}'`
  );
const { inspectChangedEdges: inspectUncached } = await import(
  `data:text/javascript,${encodeURIComponent(uncachedSource)}`
);

function probe(inspect, chain, page, extra = []) {
  const trusted = new Map([...CANONICAL_FILES, [CHAIN, chain]]);
  const sources = new Map([...trusted, [PAGE, page], ...extra]);
  const model = createSourceModel(sources, trusted);
  const provenance = createProvenance(model);
  const inventory = collectInventory(model, provenance, trusted);
  const results = [];
  for (let run = 0; run < 2; run++) {
    const graph = inspect(model, provenance, inventory);
    results.push({
      failures: graph.failures.map(entry =>
        Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('_')))
      ),
      incomplete: graph.incomplete,
      incompleteRawCount: graph.incompleteRawCount,
      reachedTestSources: [...graph.reachedTestSources],
      analysisUnknown: [...provenance.analysisUnknown],
    });
  }
  return results;
}

test('memoized graph matches uncached caller orders, mounts, recursion, diagnostics and fresh runs', () => {
  const cases = [
    ...sharedCallerModels(),
    {
      chain: 'export function recur(){ recur(); }',
      page: 'import {recur} from "../chain"; recur();',
    },
    {
      chain: 'export function Leaf(){ unknown(); unknown(); }',
      page: 'import {Leaf} from "../chain"; Leaf(); Leaf();',
    },
    {
      chain: 'import {db} from "@interdomestik/database"; export function Leaf(){db.select();}',
      page: 'import {Leaf} from "../chain"; Leaf();',
      extra: [['apps/web/src/app/other.ts', 'import {Leaf} from "../chain"; Leaf();']],
    },
    { chain: '', page: `opaque(() => { ${'0;'.repeat(65536)} });` },
  ];
  for (const { chain, page, extra } of cases)
    assert.deepEqual(
      probe(inspectChangedEdges, chain, page, extra),
      probe(inspectUncached, chain, page, extra)
    );
});

test('memo keys separate raw nodes, query kinds and exact caller tokens, and invalidate after settlement changes', () => {
  let state = {};
  let calls = 0;
  const source = {
    mutations: new Set(),
    unsafeMutations: new Set(),
    escapedFns: new Set(),
    analysisUnknown: new Set(),
    dispatch: { state: () => state },
    forContext: context => ({
      ...source,
      provenance: () => {
        calls++;
        return context ? 'tenant-context' : 'db';
      },
      tenantHandle: () => {
        calls++;
        return Boolean(context);
      },
    }),
  };
  const forContext = createGraphProvenance(source);
  const node = {},
    twinNode = {},
    one = {},
    two = {};
  for (const context of [undefined, one, two]) {
    const scoped = forContext(context);
    assert.equal(scoped.analysisUnknown, source.analysisUnknown);
    for (const raw of [node, twinNode]) {
      assert.equal(scoped.provenance(raw), context ? 'tenant-context' : 'db');
      assert.equal(scoped.tenantHandle(raw), Boolean(context));
      scoped.provenance(raw);
      scoped.tenantHandle(raw);
    }
  }
  assert.equal(calls, 12);
  for (const invalidate of [
    () => source.mutations.add({}),
    () => source.unsafeMutations.add({}),
    () => source.escapedFns.add({}),
    () => {
      state = {};
    },
  ]) {
    invalidate();
    forContext(one).tenantHandle(node);
  }
  assert.equal(calls, 16);
});

test('unknown and exceptions are retried, and memo instances never share entries', () => {
  const node = {};
  let calls = 0;
  let answer = 'unknown';
  const source = {
    provenance: () => {
      calls++;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  const scoped = createGraphProvenance(source)();
  assert.equal(scoped.provenance(node), 'unknown');
  assert.equal(scoped.provenance(node), 'unknown');
  answer = new Error('interrupted');
  assert.throws(() => scoped.provenance(node), /interrupted/u);
  answer = 'db';
  assert.equal(scoped.provenance(node), 'db');
  assert.equal(scoped.provenance(node), 'db');
  assert.equal(createGraphProvenance(source)().provenance(node), 'db');
  assert.equal(calls, 5);
});

test('a warm memo cannot bypass nested shared fuel or conceal exhaustion from the original set', () => {
  const analysisUnknown = new Set();
  const work = createProvenanceBudget(analysisUnknown);
  const inner = {},
    outer = {};
  let scoped,
    outerCalls = 0;
  const source = {
    analysisUnknown,
    provenance: raw =>
      work.run(() => {
        if (raw === outer) {
          outerCalls++;
          for (let step = 0; step < 131072; step++) work.enter();
          return scoped.provenance(inner);
        }
        work.enter();
        return 'db';
      }),
  };
  scoped = createGraphProvenance(source)();
  assert.equal(scoped.provenance(inner), 'db');
  assert.equal(scoped.provenance(outer), 'unknown');
  assert.equal(scoped.provenance(outer), 'unknown');
  assert.equal(outerCalls, 2);
  assert.ok(analysisUnknown.has('provenance-work-bound'));
  assert.equal(scoped.provenance(inner), 'db');
});
