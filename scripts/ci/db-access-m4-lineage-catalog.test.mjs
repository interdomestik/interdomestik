import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { M4_LINEAGE_CATALOG as catalog } from './db-access-m4-lineage-catalog.mjs';
import { resolveLineageData } from './db-access-m4-lineage-selection.mjs';
import {
  root,
  hash,
  prefix,
  dataFiles,
  retainedIds,
  qualificationIds,
  tlsIds,
  tlsFiles,
  strictIds,
  strictFiles,
  affectedIds,
  restoredSourceFiles,
  qualificationFiles,
  oldRelayRow,
  sourceModel,
  withStorageMutation,
} from './db-access-m4-lineage-catalog-test.fixture.mjs';

test('finite current source class preserves44 sites and admits no runtime or production credit', () => {
  assert.equal(ts.version, '5.9.3');
  assert.equal(catalog.sourceClass, 'retained-live-with-qualification-only-tls-v1');
  assert.equal(Object.keys(catalog.frontier).length, 99);
  assert.equal(catalog.sites.length, 44);
  assert.equal(catalog.runtimeAdmission, false);
  assert.equal(catalog.productionCCredit, 0);
  assert.equal(catalog.historicalIdentitySelection, false);
});

test('all actual current frontier and exact AST locators resolve without native credit', () => {
  const selected = resolveLineageData(sourceModel(), { entries: [] }, catalog);
  assert.equal(selected.description.sites.length, 44);
  assert.deepEqual(selected.description.entries, []);
  assert.equal(selected.description.acceptedCoverage, 0);
  assert.equal(selected.description.runtimeAdmission, false);
  for (const site of selected.description.sites) {
    assert.equal(site.equivalenceAccepted, false);
    assert.equal(site.oldMountRetired, false);
  }
});

test('restored original query and factory anchors remain selected and historical IDs are references', () => {
  const admin = catalog.sites.find(site => site.id === retainedIds[0]);
  const factories = catalog.sites.find(site => site.id === retainedIds[3]);
  assert.equal(admin.calls.length, 2);
  assert.equal(admin.owners.length, 1);
  assert.deepEqual(
    factories.calls.map(node => node.kind),
    ['ParenthesizedExpression', 'ParenthesizedExpression']
  );
  assert.deepEqual(
    factories.owners.map(node => node.kind),
    ['ArrowFunction', 'ArrowFunction']
  );
  assert.deepEqual(factories.historicalIdentitiesReferenceOnly, [
    '3abe201e80665b5f1d95dd025e8694e386fd4eedab84512fa06b501c27ad7353',
    '23045f68d4b176bb5a96c7ce1100eb6639006081e00ffbb87a42f31871abbab0',
  ]);
  for (const id of retainedIds) {
    const site = catalog.sites.find(row => row.id === id);
    assert.equal(site.unobservedAnchorResidual, false);
    assert.ok(site.calls.length > 0 && site.owners.length > 0);
  }
});

test('former relay observations have new qualification IDs and separate exact historical references', () => {
  for (const [i, role] of ['admin', 'agent', 'staff'].entries()) {
    const site = catalog.sites.find(row => row.id === qualificationIds[i]);
    assert.equal(
      site.file,
      'apps/web/src/server/operations/m4-qualification-' + role + '-assignment.ts'
    );
    assert.equal(site.side, 'qualification-only');
    assert.equal(site.family, 'qualification-assignment-source');
    assert.equal(site.observationScope, 'qualification-only-source-observation');
    assert.equal(site.productionCCredit, 0);
    assert.equal(site.runtimeAdmission, false);
    assert.deepEqual(site.historicalIdentitiesReferenceOnly, []);
    assert.equal(
      site.predecessorObservationReference.id,
      'mounted-assignment-current/residual/' + i
    );
    assert.equal(
      site.predecessorObservationReference.catalogSha256,
      '8e75c18ce8085fd0cf4692f02cdbc77d2cd6f5ddd550259c62abff886cc4d8f4'
    );
    assert.equal(
      catalog.sites.some(row => row.id === site.predecessorObservationReference.id),
      false
    );
  }
});

test('all27 unrelated pre-restoration site records retain their exact predecessor JSON bytes', () => {
  assert.equal(
    hash(JSON.stringify(catalog.sites.filter(site => !affectedIds.has(site.id)))),
    '63d731d36a9dac735d532c56c09c6327562011f82271df1f49ad6fc2ce1aa131'
  );
});

test('all74 unrelated pre-restoration frontier entries preserve exact predecessor values and order', () => {
  const omitted = new Set([
    ...restoredSourceFiles,
    ...qualificationFiles,
    ...tlsFiles,
    ...strictFiles,
  ]);
  const unrelated = Object.entries(catalog.frontier).filter(([file]) => !omitted.has(file));
  assert.equal(unrelated.length, 74);
  assert.equal(
    hash(JSON.stringify(unrelated)),
    '7359cb2ed852c8f3057d58e5a2786e42bf3ea5b30aaf60ea966fff3d36d21485'
  );
});

test('raw historical relay record digest and predecessor reference remain distinct from current AST', () => {
  assert.equal(
    catalog.historicalCatalogReference,
    '16fe6ea2cb5642f832ccf9ccc71a121bac1836210b8d58df1129f5ae4c07722c'
  );
  const current = catalog.sites.find(site => site.id === qualificationIds[0]);
  assert.equal(
    hash(JSON.stringify(oldRelayRow)),
    current.predecessorObservationReference.recordSha256
  );
  assert.notEqual(oldRelayRow.file, current.file);
  assert.notEqual(oldRelayRow.sourceSha256, current.sourceSha256);
});

test('actual storage reader accepts exact successor data in an isolated data-only fixture', async () => {
  await withStorageMutation(
    () => {},
    async load => {
      const actual = (await load()).M4_LINEAGE_CATALOG;
      assert.deepEqual(actual, catalog);
    }
  );
});

test('missing one restored factory operation refuses despite freshly recomputed storage pins', async () => {
  await withStorageMutation(
    values => values[3].sites.find(site => site.id === retainedIds[3]).calls.pop(),
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('missing one restored factory owner refuses despite freshly recomputed storage pins', async () => {
  await withStorageMutation(
    values => values[3].sites.find(site => site.id === retainedIds[3]).owners.pop(),
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('qualification observation under a public action path is refused despite refreshed storage pins', async () => {
  await withStorageMutation(
    values => {
      const site = values[3].sites.find(row => row.id === qualificationIds[0]);
      site.file = 'apps/web/src/actions/admin-claims/assign.core.ts';
      site.sourceSha256 = values[1].frontier[site.file];
    },
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('stale former production relay record cannot replace the current qualification class', async () => {
  await withStorageMutation(
    values => {
      const i = values[3].sites.findIndex(row => row.id === qualificationIds[0]);
      values[3].sites[i] = structuredClone(oldRelayRow);
    },
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('an altered current factory AST locator refuses through actual selection', () => {
  const changed = structuredClone(catalog);
  changed.sites.find(site => site.id === retainedIds[3]).calls[0].startUtf16++;
  assert.throws(
    () => resolveLineageData(sourceModel(), { entries: [] }, changed),
    /missing or changed exact AST node/
  );
});

test('stale experimental frontier hash cannot stand for restored live source', () => {
  const changed = structuredClone(catalog);
  changed.frontier[oldRelayRow.file] = oldRelayRow.sourceSha256;
  assert.throws(
    () => resolveLineageData(sourceModel(), { entries: [] }, changed),
    /frontier source/
  );
});

test('restored factory owners select only explicit current synthetic inventory, never old coverage', () => {
  const model = sourceModel();
  const site = catalog.sites.find(row => row.id === retainedIds[3]);
  const sf = model.parsed.get(site.file);
  const actual = [];
  model.walk(sf, node => actual.push(node));
  const at = expected => {
    const found = actual.filter(
      node =>
        node.getStart(sf) === expected.startUtf16 &&
        node.end === expected.endUtf16 &&
        node.kind === expected.kindCode
    );
    assert.equal(found.length, 1);
    return found[0];
  };
  const entries = site.calls.map((call, i) => ({
    identity: 'synthetic-current-factory-' + i,
    file: site.file,
    method: 'escape',
    _node: at(call),
    _owner: at(site.owners[i]),
    _incomplete: true,
  }));
  const selected = resolveLineageData(model, { entries }, catalog).description;
  assert.equal(selected.entries.length, 2);
  assert.deepEqual(
    selected.entries.map(row => row.identity),
    entries.map(row => row.identity)
  );
  assert.ok(selected.entries.every(row => row.memberships.some(value => value.siteId === site.id)));
  assert.ok(
    selected.entries.every(row => !site.historicalIdentitiesReferenceOnly.includes(row.identity))
  );
  assert.equal(selected.acceptedCoverage, 0);
  assert.equal(selected.runtimeAdmission, false);
});

test('a generic or foreign source class is refused with otherwise current records', async () => {
  await withStorageMutation(
    values => {
      values[0].sourceClass = 'arbitrary-source';
    },
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('the exact historical predecessor cannot be silently substituted', async () => {
  await withStorageMutation(
    values => {
      values[0].historicalCatalogReference = '0'.repeat(64);
    },
    load => assert.rejects(load, /fixed catalog storage/)
  );
});
