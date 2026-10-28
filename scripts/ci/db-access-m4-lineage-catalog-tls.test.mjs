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

test('all34 unrelated preTLS records and90 frontier entries retain exact predecessor data', () => {
  assert.equal(
    hash(
      JSON.stringify(
        catalog.sites.filter(site => !tlsIds.includes(site.id) && !strictIds.includes(site.id))
      )
    ),
    'c80282823c57d3c24385a5e4dea0f18a3541d8289b842d95711bc3742b117c1d'
  );
  const unaffected = Object.entries(catalog.frontier).filter(
    ([file]) => !tlsFiles.includes(file) && !strictFiles.includes(file)
  );
  assert.equal(unaffected.length, 90);
  assert.equal(
    hash(JSON.stringify(unaffected)),
    '367f72271e924ac3c62999322d87fad514b4a072a91e766256b8b47edf95ac53'
  );
});

test('the new strict TLS helper selects its actual function and verifier method with no historical allocation', () => {
  const site = catalog.sites.find(row => row.id === tlsIds[2]);
  assert.equal(site.file, 'apps/web/src/server/operations/m4-pool-posture.ts');
  assert.deepEqual(
    site.owners.map(row => row.kind),
    ['FunctionDeclaration', 'MethodDeclaration']
  );
  assert.deepEqual(
    site.calls.map(row => row.kind),
    ['NewExpression', 'CallExpression', 'CallExpression']
  );
  assert.equal(site.side, 'source-only');
  assert.equal(site.observationScope, 'private-strict-tls-source-observation');
  assert.equal(site.runtimeAdmission, false);
  assert.equal(site.productionCCredit, 0);
  assert.equal(site.previousObservationExists, false);
  assert.deepEqual(site.historicalIdentitiesReferenceOnly, []);
  assert.equal(site.predecessorCatalogReferenceOnly, catalog.historicalCatalogReference);
  const selected = resolveLineageData(sourceModel(), { entries: [] }, catalog).description;
  assert.equal(selected.acceptedCoverage, 0);
  assert.equal(selected.runtimeAdmission, false);
});

test('missing standard TLS verifier owner refuses despite recomputed storage pins', async () => {
  await withStorageMutation(
    values => values[3].sites.find(site => site.id === tlsIds[2]).owners.pop(),
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('a TLS observation under a foreign source path is refused despite recomputed storage pins', async () => {
  await withStorageMutation(
    values => {
      const site = values[3].sites.find(row => row.id === tlsIds[2]);
      site.file = 'apps/web/src/server/operations/m4-private-runtime.ts';
      site.sourceSha256 = values[1].frontier[site.file];
    },
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('preTLS constructor AST cannot be relabeled as current TLS source', async () => {
  await withStorageMutation(
    values => {
      values[3].sites.find(row => row.id === tlsIds[1]).owners[0] = {
        kind: 'FunctionDeclaration',
        startUtf16: 1748,
        endUtf16: 10418,
        nodeSha256: '2513d1dfecda0fc43bc876e0e943a0f58982b55f3e994e97b1bdfc96ea493e3e',
        kindCode: 263,
      };
    },
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('the actual selector refuses the stale preTLS constructor locator', () => {
  const changed = structuredClone(catalog);
  changed.sites.find(row => row.id === tlsIds[1]).owners[0] = {
    kind: 'FunctionDeclaration',
    startUtf16: 1748,
    endUtf16: 10418,
    nodeSha256: '2513d1dfecda0fc43bc876e0e943a0f58982b55f3e994e97b1bdfc96ea493e3e',
    kindCode: 263,
  };
  assert.throws(
    () => resolveLineageData(sourceModel(), { entries: [] }, changed),
    /missing or changed exact AST node/
  );
});

test('a stale preTLS helper source hash cannot stand for current endpoint checking', () => {
  const changed = structuredClone(catalog);
  changed.frontier[tlsFiles[2]] =
    '213f3749dc7b85ba1d53bd5e69617c21cd19ee176ca5fda9c55b6302cb4dda62';
  assert.throws(
    () => resolveLineageData(sourceModel(), { entries: [] }, changed),
    /frontier source/
  );
});

test('three strict helper sites resolve actual AST as source-only with no historical credit', () => {
  for (const id of strictIds.slice(-3)) {
    const site = catalog.sites.find(row => row.id === id);
    assert.equal(site.side, 'source-only');
    assert.equal(site.observationScope, 'strict-private-helper-source-observation');
    assert.equal(site.runtimeAdmission, false);
    assert.equal(site.productionCCredit, 0);
    assert.equal(site.previousObservationExists, false);
    assert.deepEqual(site.historicalIdentitiesReferenceOnly, []);
    assert.ok(site.owners.length > 0);
  }
  const selected = resolveLineageData(sourceModel(), { entries: [] }, catalog);
  assert.equal(selected.description.sites.length, 44);
  assert.equal(selected.description.acceptedCoverage, 0);
});

test('a missing strict helper owner refuses even with recomputed shard descriptors', async () => {
  await withStorageMutation(
    values => values[4].sites[0].owners.pop(),
    load => assert.rejects(load, /fixed catalog storage/)
  );
});

test('a foreign strict helper AST locator refuses after source catalog mutation', () => {
  const changed = structuredClone(catalog);
  changed.sites.find(site => site.id === strictIds.at(-1)).owners[0].startUtf16++;
  assert.throws(
    () => resolveLineageData(sourceModel(), { entries: [] }, changed),
    /exact AST node/
  );
});

test('third strict helper shard cannot be substituted with a duplicate', async () => {
  await withStorageMutation(
    values => (values[4].sites[1] = structuredClone(values[4].sites[0])),
    load => assert.rejects(load, /fixed catalog storage/)
  );
});
