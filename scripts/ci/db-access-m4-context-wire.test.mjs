import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeM4ContextBatches } from './db-access-m4-context-wire.mjs';
import { digest } from './db-access-trust.mjs';
import {
  owner,
  observation,
  entry,
  collect,
  incomplete,
} from './db-access-m4-context-test-utils.mjs';

function wireFixture() {
  const rows = ['root-a.ts', 'root-b.ts'].map(origin => observation({ origin, incomplete: true }));
  const model = {
    sources: new Map([[owner[0], 'fixture']]),
    parsed: new Map([[owner[0], {}]]),
    walk: (_sf, visit) => visit({ pos: 0, end: 100, kind: 262 }),
  };
  const source = {
    files: [owner[0]],
    policyDigest: 'fixture-only',
    bookends: {},
  };
  const prepared = {
    model,
    providerUnit: { m4Proof: source },
    inventory: {
      changed: new Set(rows.map(row => row.origin)),
      entries: [entry(rows[0], 'unknown')],
    },
  };
  const results = rows.map(row => {
    const diagnostics = incomplete({ file: row.origin, reason: 'unknown' });
    return {
      failures: [],
      incomplete: diagnostics,
      m4Contexts: {
        version: 1,
        sourcePolicyDigest: source.policyDigest,
        sourceBookends: source.bookends,
        modelDigest: digest(JSON.stringify([...model.sources])),
        roots: [row.origin],
        selectedIdentities: ['a'],
        observations: [row],
        frames: {},
        unresolved: diagnostics,
        attributions: collect([row], 'entry-incomplete', 'unknown'),
        allExecutableContextsQualified: false,
        runtimeAdmission: false,
      },
    };
  });
  return { prepared, results, partitions: rows.map(row => [row.origin]) };
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
