import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { createSourceModel } from './db-access-source.mjs';
import {
  createTempRepo,
  readReport,
  runGuard,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

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
  return { model, inventory, graph: inspectChangedEdges(model, provenance, inventory) };
}

test('a changed test fixture is inventoried but is not opened as a product graph root', () => {
  const { model, inventory, graph } = graphFor([[FIXTURE, fakeFixture]]);
  assert.ok(model.parsed.has(FIXTURE));
  assert.ok(inventory.changed.has(FIXTURE));
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

test('production evaluator leaves isolated test mocks off product roots but follows an import', () => {
  const root = createTempRepo();
  const fixture = 'apps/web/src/features/claims/mock-db.test.ts';
  writeFixture(root, fixture, [
    'const mocks = { db: { select: () => [] } };',
    'export function readMock() { return mocks.db.select(); }',
  ]);
  assert.equal(runGuard(root).status, 0);
  assert.equal(readReport(root).failingNewCount, 0);

  writeFixture(
    root,
    PAGE,
    'import { readMock } from "../../features/claims/mock-db.test"; export default function Page() { return readMock(); }'
  );
  assert.equal(runGuard(root).status, 1);
  const report = readReport(root);
  assert.ok(
    report.failingNewEntries.some(
      entry => entry.file === fixture && entry.callee === 'mocks.db.select'
    ),
    JSON.stringify(report.failingNewEntries.map(({ file, callee }) => ({ file, callee })))
  );
});
