import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { pathFixture } from './db-access-m4-path-test-utils.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeM4ContextBatches } from './db-access-m4-context-wire.mjs';
import { M4_LINEAGE_CATALOG } from './db-access-m4-lineage-catalog.mjs';
import { createLineageObserver } from './db-access-m4-lineage-observer.mjs';
import { resolveLineageData } from './db-access-m4-lineage-selection.mjs';
import { digest } from './db-access-trust.mjs';
import { entry } from './db-access-m4-context-test-utils.mjs';

function attachFixedLineageFrontier(model) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const fileOf = new WeakMap();
  model.sources = new Map([...model.parsed].map(([file, sf]) => [file, sf.text]));
  for (const file of Object.keys(M4_LINEAGE_CATALOG.frontier)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    model.sources.set(file, text);
    if (!file.endsWith('.json'))
      model.parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  model.fileOf = node => fileOf.get(node);
  model.walk = (sf, visit) => {
    const walk = node => {
      fileOf.set(node, sf.fileName);
      visit(node);
      ts.forEachChild(node, walk);
    };
    walk(sf);
  };
}

function wireFixture() {
  const fixtures = ['root-a.ts', 'root-b.ts'].map(pathFixture);
  const model = fixtures[0].model;
  attachFixedLineageFrontier(model);
  const source = {
    files: [...model.sources.keys()],
    policyDigest: digest('fixture-policy'),
    bookends: { before: digest('fixture-source'), after: digest('fixture-source') },
  };
  const prepared = {
    model,
    providerUnit: { m4Proof: source },
    inventory: {
      changed: new Set(fixtures.map(f => f.batch.roots[0])),
      entries: fixtures[0].batch.observations.map(row =>
        entry(row, row.incomplete ? 'legacy' : undefined)
      ),
    },
  };
  const lineageSelection = resolveLineageData(model, prepared.inventory, M4_LINEAGE_CATALOG);
  const lineageBinding = {
    sourcePolicyDigest: source.policyDigest,
    sourceBookends: source.bookends,
    modelDigest: digest(JSON.stringify([...model.sources])),
  };
  const results = fixtures.map(f => {
    const row = f.batch.observations[0];
    const bindings = f.batch.pathDiagnostics.frames[0].bindings.map(binding => ({
      parameter: binding.parameter,
      argument: binding.argument,
      caller: null,
    }));
    const lineage = createLineageObserver(
      lineageSelection,
      node => (node ? [model.fileOf(node), node.pos, node.end, node.kind] : null),
      () => undefined
    );
    lineage.begin();
    return {
      ...f.result,
      failures: [],
      m4Contexts: {
        version: 1,
        sourcePolicyDigest: source.policyDigest,
        sourceBookends: source.bookends,
        modelDigest: digest(JSON.stringify([...model.sources])),
        roots: f.batch.roots,
        selectedIdentities: f.batch.observations.map(value => value.identity),
        observations: f.batch.observations,
        attributions: f.batch.attributions,
        pathDiagnostics: f.batch.pathDiagnostics,
        frames: { [row.context]: bindings },
        affectedLineage: lineage.finish(lineageBinding, f.batch.roots),
        unresolved: f.result.incomplete,
        allExecutableContextsQualified: false,
        runtimeAdmission: false,
      },
    };
  });
  return { prepared, results, partitions: fixtures.map(f => f.batch.roots) };
}

test('wire merges partition-local sidecars and unchanged rows; partition replay is rejected', () => {
  const { prepared, results, partitions } = wireFixture();
  const original = structuredClone(results);
  const merged = mergeM4ContextBatches(prepared, partitions, results);
  assert.deepEqual(
    merged.attributions,
    results.flatMap(result => result.m4Contexts.attributions)
  );
  assert.deepEqual(
    merged.observations,
    results.flatMap(result => result.m4Contexts.observations)
  );
  assert.equal(merged.pathDiagnostics.batches.length, 2);
  assert.equal(merged.pathDiagnostics.batches[0].diagnostics.scopes[0].id, 'scope:0');
  assert.equal(merged.pathDiagnostics.batches[1].diagnostics.scopes[0].id, 'scope:0');
  assert.notDeepEqual(
    merged.pathDiagnostics.batches[0].roots,
    merged.pathDiagnostics.batches[1].roots
  );
  assert.equal(merged.runtimeAdmission, false);
  assert.equal(merged.allExecutableContextsQualified, false);
  assert.deepEqual(results, original);
  assert.throws(
    () => mergeM4ContextBatches(prepared, partitions, [results[0], results[0]]),
    /binding/
  );
  const foreign = structuredClone(results);
  foreign[1].m4Contexts.attributions = foreign[0].m4Contexts.attributions;
  assert.throws(() => mergeM4ContextBatches(prepared, partitions, foreign), /selected emission/);
  const missingLineage = structuredClone(results);
  delete missingLineage[0].m4Contexts.affectedLineage;
  assert.throws(
    () => mergeM4ContextBatches(prepared, partitions, missingLineage),
    /batch source\/root\/identity\/diagnostic binding/
  );
  const foreignLineage = structuredClone(results);
  foreignLineage[1].m4Contexts.affectedLineage.sourcePolicyDigest = digest('foreign-policy');
  assert.throws(
    () => mergeM4ContextBatches(prepared, partitions, foreignLineage),
    /M4 lineage wire refused: binding\/roots\/selection\/limits/
  );
});
