import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { createSourceModel } from './db-access-source.mjs';

const FIXTURE = 'apps/web/src/features/claims/__tests__/fake-db.fixture.ts';
const PAGE = 'apps/web/src/app/claims/page.tsx';
const fakeFixture = [
  'const open = new Set();',
  'export function clearFakeState() { open.delete(1); }',
].join('\n');

function graphFor(sources, trusted = new Map()) {
  const model = createSourceModel(new Map(sources), trusted);
  const provenance = createProvenance(model);
  const inventory = collectInventory(model, provenance, trusted);
  return { inventory, graph: inspectChangedEdges(model, provenance, inventory) };
}

test('a changed test fixture is inventoried but is not opened as a product graph root', () => {
  const { inventory, graph } = graphFor([[FIXTURE, fakeFixture]]);
  assert.ok(
    inventory.entries.some(entry => entry.file === FIXTURE && entry.callee === 'open.delete')
  );
  assert.deepEqual(graph.failures, []);
  assert.deepEqual(graph.incomplete, []);
});

test('a production page importing a test fixture still inspects its executable DB edge', () => {
  const fixture = [
    'import { db } from "@interdomestik/database";',
    'export function readFixture() { return db.select(); }',
  ].join('\n');
  const page = [
    'import { readFixture } from "../../features/claims/__tests__/fake-db.fixture";',
    'export default function Page() { return readFixture(); }',
  ].join('\n');
  const manifest = JSON.stringify({
    name: '@interdomestik/database',
    exports: { '.': './src/db.ts' },
  });
  const { graph } = graphFor([
    ['packages/database/package.json', manifest],
    ['packages/database/src/db.ts', 'export const db = {} as any;'],
    [FIXTURE, fixture],
    [PAGE, page],
  ]);
  assert.ok(
    graph.failures.some(
      entry => entry.file === FIXTURE && entry.callee === 'db.select' && entry.mountedFrom === PAGE
    ),
    JSON.stringify(
      graph.failures.map(({ file, callee, mountedFrom }) => ({ file, callee, mountedFrom }))
    )
  );
});
