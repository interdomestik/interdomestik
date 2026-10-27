import assert from 'node:assert/strict';
import test from 'node:test';
import { describeM4SelectedPathInspection } from './db-access-m4-path-projection.mjs';
import { validateM4PathDiagnostics } from './db-access-m4-path-wire.mjs';
import { pathFixture } from './db-access-m4-path-test-utils.mjs';

// Pure projection contract fixtures; no native/session authority is created here.
function fixture(origins = ['fixture.ts']) {
  const fixtures = origins.map(pathFixture);
  fixtures.forEach(f => validateM4PathDiagnostics(f.batch, f.result, f.model));
  const diagnostics = fixtures.flatMap(f => f.result.incomplete);
  const path = {
    version: 1,
    batches: fixtures.map(f => ({ roots: f.batch.roots, diagnostics: f.batch.pathDiagnostics })),
    outsideScopeApplicability: 'unresolved',
    runtimeAdmission: false,
    allExecutableContextsQualified: false,
  };
  const native = {
    rawGraph: { m4Contexts: { pathDiagnostics: path }, incomplete: diagnostics },
    raw: { diagnostics: [...diagnostics] },
    report: { incomplete: [...diagnostics, { file: '<m4>', reason: 'later', occurrences: 1 }] },
  };
  return { native, path, inspect: () => describeM4SelectedPathInspection(native) };
}

test('path union includes old overlap once and preserves all unmatched original counts', () => {
  const f = fixture(),
    before = structuredClone(f.native),
    out = f.inspect();
  assert.equal(out.batches, f.path.batches);
  assert.equal(out.totals.selectedPathOccurrences, 3);
  assert.equal(out.totals.legacyOverlapOccurrences, 2);
  assert.equal(out.totals.additionalPathOccurrences, 1);
  assert.equal(out.totals.offPathOccurrences, 1);
  assert.equal(out.diagnostics.graphDiagnostics.totals.originalOccurrences, 5);
  assert.equal(out.diagnostics.graphDiagnostics.totals.claimedOccurrences, 3);
  assert.equal(out.diagnostics.graphDiagnostics.totals.unattributedOccurrences, 2);
  assert.equal(out.diagnostics.reportDiagnostics.totals.unattributedOccurrences, 3);
  const group = out.diagnostics.graphDiagnostics.groups[0];
  assert.deepEqual(group.indices, [0]);
  assert.deepEqual(group.recordReferences, [{ batchIndex: 0, recordIndex: 0 }]);
  assert.equal(group.originalOccurrences, 3);
  assert.equal(group.claimedOccurrences, 2);
  assert.equal(group.legacyOverlapOccurrences, 2);
  assert.equal(group.residualOccurrences, 1);
  assert.equal(out.outsideScopeApplicability, 'unresolved');
  assert.equal(out.acceptedCoverage, 0);
  assert.equal(out.nativeAdmission, false);
  assert.deepEqual(f.native, before);
});

test('same local scope/frame names remain distinct owned-batch namespaces', () => {
  const f = fixture(['root-a.ts', 'root-b.ts']),
    out = f.inspect();
  assert.equal(out.batches.length, 2);
  assert.equal(out.batches[0].diagnostics.scopes[0].id, 'scope:0');
  assert.equal(out.batches[1].diagnostics.scopes[0].id, 'scope:0');
  assert.notDeepEqual(out.batches[0].roots, out.batches[1].roots);
  assert.equal(out.totals.selectedPathOccurrences, 6);
  assert.equal(out.totals.legacyOverlapOccurrences, 4);
  assert.equal(out.diagnostics.graphDiagnostics.groups.length, 4);
  assert.deepEqual(out.diagnostics.graphDiagnostics.groups[2].recordReferences, [
    { batchIndex: 1, recordIndex: 0 },
  ]);
});

test('later namespace missing a path key remains explicitly unresolved without clamping', () => {
  const f = fixture();
  f.native.report.incomplete[1] = { file: '<m4>', reason: 'different', occurrences: 1 };
  const out = f.inspect();
  assert.equal(out.diagnostics.graphDiagnostics.resolution, 'key-groups-resolved');
  assert.equal(out.diagnostics.reportDiagnostics.resolution, 'unresolved-namespace-links');
  assert.equal(out.diagnostics.reportDiagnostics.totals.unattributedOccurrences, null);
  assert.equal(out.diagnostics.reportDiagnostics.groups[1].residualOccurrences, null);
});

test('missing original path anchor or inconsistent union counter refuses projection', () => {
  const f = fixture();
  f.native.rawGraph.incomplete = f.native.rawGraph.incomplete.slice(1);
  assert.throws(() => f.inspect(), /missing\/overclaimed original emission/);
  const g = fixture();
  g.path.batches[0].diagnostics.counters.selectedPathOccurrences++;
  assert.throws(() => g.inspect(), /axis\/counter mismatch/);
  const h = fixture();
  for (const key of ['selectedPathOccurrences', 'additionalPathOccurrences', 'wrappedOccurrences'])
    h.path.batches[0].diagnostics.counters[key]++;
  assert.throws(() => h.inspect(), /record\/counter mismatch/);
});
