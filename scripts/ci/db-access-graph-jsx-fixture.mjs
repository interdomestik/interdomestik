import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';

// Test-only graph probe over small in-memory sources. The page is the only changed file and every
// other module is approved. Real source model, provenance, inventory and graph are used; no
// repository file, CLI, report, receipt or timing is involved. A probe result therefore proves
// only this lower model/provenance/inventory/graph layer, never an authenticated CLI pass.
export const PAGE = 'apps/web/src/app/page.tsx';
export const CHAIN = 'apps/web/src/chain.tsx';
const DB = 'packages/database/src/db.ts';
const MANIFEST = JSON.stringify({
  name: '@interdomestik/database',
  exports: { '.': './src/db.ts' },
});
export const AMBIENT_LEAF =
  'import {db} from "@interdomestik/database"; export function Leaf(){ return db.select(); }';

const lines = values => `${values.join('\n')}\n`;

// Canonical tenant helper shape copied from guard-test-utils createTempRepo. Passed as extra
// trusted sources; these entries replace the minimal database manifest and db module above.
export const CANONICAL_FILES = [
  [
    'packages/database/package.json',
    JSON.stringify({
      name: '@interdomestik/database',
      exports: { '.': './src/index.ts', './db': './src/db.ts', './tenant': './src/tenant.ts' },
    }),
  ],
  [
    'packages/database/src/index.ts',
    lines([
      'export { db, dbAdmin, dbRls } from "./db";',
      'export { withTenantContext, withTenantDb } from "./tenant";',
      'export const claims = {};',
    ]),
  ],
  [
    DB,
    lines([
      'export const db = {} as any;',
      'export const dbRls = {} as any;',
      'export const dbAdmin = {} as any;',
    ]),
  ],
  [
    'packages/database/src/tenant.ts',
    lines([
      'export async function withTenantContext(context: any, action: any) { return action({}); }',
      'export const withTenantDb = withTenantContext;',
    ]),
  ],
];

function tally(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

// extra: additional [path, source] trusted entries, e.g. a declared external dependency manifest.
export function graphProbe(chain, page, chainFile = CHAIN, extra = []) {
  const trusted = new Map([
    ['packages/database/package.json', MANIFEST],
    [DB, 'export const db = {} as any;'],
    ...extra,
    [chainFile, chain],
  ]);
  const sources = new Map(trusted).set(PAGE, page);
  const model = createSourceModel(sources, trusted);
  const provenance = createProvenance(model);
  const inventory = collectInventory(model, provenance, trusted);
  const graph = inspectChangedEdges(model, provenance, inventory);
  return {
    changed: [...inventory.changed],
    failures: graph.failures,
    incomplete: graph.incomplete,
    incompleteRawCount: graph.incompleteRawCount,
    reaches: tally(graph.failures.map(item => item.callee)),
    reasons: graph.incomplete.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + item.occurrences;
      return counts;
    }, {}),
    entries: inventory.entries.map(({ file, callee, tenantPosture }) => ({
      file,
      callee,
      tenantPosture,
    })),
  };
}

// Nested component wrappers C0 -> ... -> Leaf mounted with self-closing or paired tags.
export function wrapperChain(leaf, depth, paired) {
  const mount = name => (paired ? `<${name}></${name}>` : `<${name}/>`);
  let chain = leaf;
  let child = 'Leaf';
  for (let index = depth - 1; index >= 0; index--) {
    chain += ` export function C${index}(){return ${mount(child)};}`;
    child = `C${index}`;
  }
  return {
    chain,
    page: `import {${child}} from "../chain"; export default function Page(){return ${mount(child)};}`,
  };
}

export const pageWith = (imports, body) =>
  `import {${imports}} from "../chain"; export default function Page(){return ${body};}`;

// Acyclic binary DAG: every level mounts the next level twice and the last level mounts Leaf
// twice, so the page performs 2^depth actual Leaf mounts through a tiny source and a path that is
// only depth + 2 components deep. No recursion and no executable call is involved.
export function branchingChain(leaf, depth) {
  let chain = leaf;
  let child = 'Leaf';
  for (let index = depth - 1; index >= 0; index--) {
    chain += ` export function C${index}(){return <><${child}/><${child}/></>;}`;
    child = `C${index}`;
  }
  return { chain, page: pageWith(child, `<${child}/>`) };
}

// The exact same shared reader and JSX wrapper are used in all three fresh source models.
export function sharedCallerModels() {
  const shared = [
    'import {db, withTenantContext} from "@interdomestik/database";',
    'function leaf(tx){return tx.select();}',
    'function Wrapper(tx){return <section>{leaf(tx)}</section>;}',
  ].join(' ');
  const safe = 'export function Safe(){return withTenantContext({}, tx => Wrapper(tx));}';
  const ambient = 'export function Ambient(){return Wrapper(db);}';
  return [
    { chain: `${shared} ${safe}`, page: pageWith('Safe', '<Safe/>') },
    {
      chain: `${shared} ${safe} ${ambient}`,
      page: pageWith('Safe, Ambient', '<><Safe/><Ambient/></>'),
      kinds: ['canonical-tx', 'unknown-ambient'],
    },
    {
      chain: `${shared} ${ambient} ${safe}`,
      page: pageWith('Safe, Ambient', '<><Ambient/><Safe/></>'),
      kinds: ['unknown-ambient', 'canonical-tx'],
    },
  ];
}
