import ts from 'typescript';
import { pathFixture } from './db-access-m4-path-test-utils.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeM4ContextBatches } from './db-access-m4-context-wire.mjs';
import { digest } from './db-access-trust.mjs';
import { entry } from './db-access-m4-context-test-utils.mjs';

function wireFixture() {
  const fixtures = ['root-a.ts', 'root-b.ts'].map(pathFixture);
  const model = fixtures[0].model;
  model.sources = new Map([...model.parsed].map(([file, sf]) => [file, sf.text]));
  model.walk = (sf, visit) => {
    const walk = node => {
      visit(node);
      ts.forEachChild(node, walk);
    };
    walk(sf);
  };
  const source = { files: [...model.parsed.keys()], policyDigest: 'fixture-only', bookends: {} };
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
  const results = fixtures.map(f => {
    const row = f.batch.observations[0];
    const bindings = f.batch.pathDiagnostics.frames[0].bindings.map(binding => ({
      parameter: binding.parameter,
      argument: binding.argument,
      caller: null,
    }));
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
});
