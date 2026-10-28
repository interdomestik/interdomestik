import assert from 'node:assert/strict';
import test from 'node:test';
import { createM4AttributionCollector } from './db-access-m4-context-attribution.mjs';

import { fixture, observation } from './db-access-m4-context-projection.test-fixture.mjs';

test('all finite rows, unobserved selected IDs and binding data survive without exposing the native view', () => {
  const { native, runtime, inspect } = fixture(),
    before = structuredClone(native),
    result = inspect();
  assert.equal(result.observations, native.rawGraph.m4Contexts.observations);
  assert.equal(result.attributions, native.rawGraph.m4Contexts.attributions);
  assert.equal(result.frames, native.rawGraph.m4Contexts.frames);
  assert.deepEqual(result.selectedIdentities, ['unsafe', 'incomplete', 'unobserved']);
  assert.deepEqual(result.unobservedSelectedIdentities, ['unobserved']);
  assert.deepEqual(result.roots, ['root.ts']);
  assert.equal(result.censusModelDigest, 'census-model');
  assert.equal(result.sourceBookends, native.rawGraph.m4Contexts.sourceBookends);
  assert.equal(result.contextOccurrences, 4);
  assert.equal(result.nativeOutputDigest, 'native-output');
  assert.equal(result.runtimeContextSha256, runtime.contextSha256);
  assert.equal(result.runtimePolicySha256, runtime.policySha256);
  assert.equal(result.nativeEvent, native.eventBinding);
  assert.equal(result.native, undefined);
  assert.equal(result.runtime, undefined);
  assert.deepEqual(native, before);
  for (const field of ['runtimeAdmission', 'nativeAdmission', 'allExecutableContextsQualified'])
    assert.equal(result[field], false);
  assert.equal(result.acceptedCoverage, 0);
  assert.equal(result.productionCCredit, 0);
});

test('each diagnostic namespace preserves its own indices, totals and unmatched complement', () => {
  const { inspect } = fixture(),
    { diagnostics } = inspect();
  const graph = diagnostics.graphDiagnostics,
    raw = diagnostics.rawDiagnostics,
    report = diagnostics.reportDiagnostics;
  assert.equal(graph.original.path, '/rawGraph/incomplete');
  assert.equal(raw.original.path, '/raw/diagnostics');
  assert.equal(report.original.path, '/report/incomplete');
  assert.deepEqual(graph.groups[0].indices, [0]);
  assert.deepEqual(graph.groups[0].attributionIndices, [2]);
  assert.equal(graph.groups[0].originalOccurrences, 3);
  assert.equal(graph.groups[0].claimedOccurrences, 2);
  assert.equal(graph.groups[0].residualOccurrences, 1);
  assert.deepEqual(
    [graph, raw, report].map(n => n.totals.originalOccurrences),
    [7, 12, 18]
  );
  assert.deepEqual(
    [graph, raw, report].map(n => n.totals.unattributedOccurrences),
    [5, 10, 16]
  );
  assert.deepEqual(
    [graph, raw, report].map(n => n.totals.unmatchedRows),
    [1, 2, 3]
  );
  assert.equal(graph.relation, 'selected-emission-key-group');
  assert.equal(raw.relation, 'cross-namespace-key-reference');
  assert.match(report.unmatchedIndexDefinition, /minus/);
  assert.equal(inspect().original.reportUnresolved.endExclusive, 1);
});

test('unsafe frames share original failure emission indices without using deduped raw failures', () => {
  const { inspect } = fixture(),
    result = inspect(),
    failure = result.graphFailures;
  assert.deepEqual(failure.groups[0].indices, [0, 1]);
  assert.deepEqual(failure.groups[0].attributionIndices, [0, 1]);
  assert.equal(failure.groups[0].claimedOccurrences, 2);
  assert.equal(failure.groups[0].residualOccurrences, 0);
  assert.equal(failure.totals.originalRows, 3);
  assert.equal(result.original.rawFailures.endExclusive, 2);
  assert.equal(failure.totals.unattributedOccurrences, 1);
});

test('undefined/null normalize into the exact shared key and preserve both original indices', () => {
  const { native, inspect } = fixture();
  native.rawGraph.m4Contexts.attributions[2].reason = undefined;
  native.rawGraph.incomplete = [
    { file: 'root.ts', reason: undefined, occurrences: 2 },
    { file: 'root.ts', reason: null, occurrences: 3 },
  ];
  const group = inspect().diagnostics.graphDiagnostics.groups[0];
  assert.equal(group.key, '["root.ts",null]');
  assert.deepEqual(group.indices, [0, 1]);
  assert.equal(group.originalOccurrences, 5);
  assert.equal(group.residualOccurrences, 3);
});

test('one owner recursion record is not multiplied by its affected identities', () => {
  const { native, inspect } = fixture();
  const rows = ['a', 'b'].map(identity =>
    observation({ identity, outcome: 'recursion', occurrences: 2 })
  );
  const collector = createM4AttributionCollector();
  collector.add(rows, 'owner-recursion', 'recursive executable edge');
  collector.add(rows, 'owner-recursion', 'recursive executable edge');
  native.rawGraph.m4Contexts = {
    ...native.rawGraph.m4Contexts,
    roots: ['root.ts'],
    selectedIdentities: ['a', 'b'],
    observations: rows,
    attributions: collector.entries(),
    frames: {},
    unresolved: [],
  };
  native.rawGraph.incomplete = [
    { file: 'root.ts', reason: 'recursive executable edge', occurrences: 2 },
  ];
  assert.equal(inspect().diagnostics.graphDiagnostics.groups[0].claimedOccurrences, 2);
});

test('missing or overclaimed anchor diagnostics and failures refuse projection', () => {
  for (const modify of [
    n => {
      n.rawGraph.incomplete = [];
    },
    n => {
      n.rawGraph.incomplete[0].occurrences = 1;
    },
    n => {
      n.rawGraph.failures = n.rawGraph.failures.slice(1);
    },
  ]) {
    const { native, inspect } = fixture();
    modify(native);
    assert.throws(inspect, /missing\/overclaimed original emission/);
  }
});

test('later namespace shortages are explicit unresolved links with null rather than negative residuals', () => {
  const { native, inspect } = fixture();
  native.raw.diagnostics = [{ file: 'elsewhere', reason: 'why', occurrences: 10 }];
  native.report.incomplete = [{ file: 'root.ts', reason: 'why', occurrences: 1 }];
  const { rawDiagnostics: raw, reportDiagnostics: report } = inspect().diagnostics;
  assert.equal(raw.groups[0].resolution, 'missing-key');
  assert.equal(report.groups[0].resolution, 'insufficient-occurrences');
  for (const ns of [raw, report]) {
    assert.equal(ns.resolution, 'unresolved-namespace-links');
    assert.equal(ns.groups[0].residualOccurrences, null);
    assert.equal(ns.totals.unattributedOccurrences, null);
    assert.equal(ns.totals.claimedOccurrences, 2);
  }
});

test('missing input arrays, observation links, bindings and invalid counts refuse projection', () => {
  for (const modify of [
    n => {
      delete n.rawGraph.m4Contexts.attributions;
    },
    n => {
      delete n.report.incomplete;
    },
    n => {
      delete n.eventBinding;
    },
    n => {
      n.rawGraph.m4Contexts.attributions[0].observationKeys = ['foreign'];
    },
    n => {
      n.rawGraph.incomplete[0].occurrences = -1;
    },
    n => {
      n.rawGraph.incomplete[0].occurrences = Number.MAX_SAFE_INTEGER;
    },
  ]) {
    const { native, inspect } = fixture();
    modify(native);
    assert.throws(inspect, /M4 context inspection/);
  }
});

test('unmatched rows do not create per-row output groups', () => {
  const { native, inspect } = fixture();
  native.rawGraph.incomplete.push(
    ...Array.from({ length: 100 }, (_, i) => ({
      file: 'unmatched.ts',
      reason: String(i),
      occurrences: 2,
    }))
  );
  const result = inspect().diagnostics.graphDiagnostics;
  assert.equal(result.groups.length, 1);
  assert.equal(result.original.endExclusive, 102);
  assert.equal(result.totals.unmatchedRows, 101);
  assert.equal(result.totals.unmatchedOccurrences, 204);
  assert.deepEqual(result.groups[0].indices, [0]);
});

test('empty claims still count every original row and occurrence in every namespace', () => {
  const { native, inspect } = fixture();
  native.rawGraph.m4Contexts.observations = [];
  native.rawGraph.m4Contexts.attributions = [];
  const result = inspect();
  const namespaces = [...Object.values(result.diagnostics), result.graphFailures];
  assert.deepEqual(
    namespaces.map(value => value.totals.originalOccurrences),
    [7, 12, 18, 3]
  );
  for (const value of namespaces) {
    assert.deepEqual(value.groups, []);
    assert.equal(value.totals.unmatchedRows, value.totals.originalRows);
    assert.equal(value.totals.unattributedOccurrences, value.totals.originalOccurrences);
    assert.equal(value.totals.claimedOccurrences, 0);
  }
  assert.deepEqual(result.unobservedSelectedIdentities, ['unsafe', 'incomplete', 'unobserved']);
  native.rawGraph.incomplete[0].occurrences = 0;
  assert.throws(inspect, /invalid multiplicity/);
});

test('irrelevant string origins and unsafe identities are counted without reading their key reason', () => {
  const { native, inspect } = fixture();
  // A getter is only a test probe for work avoided; genuine native output binding
  // rejects accessors, and this pure-data test does not assert native authority.
  native.rawGraph.incomplete[1] = {
    file: 'other.ts',
    occurrences: 4,
    get reason() {
      throw Error('unmatched diagnostic key was serialized');
    },
  };
  native.rawGraph.failures[2] = {
    identity: 'unselected',
    mountedFrom: 'root.ts',
    get reason() {
      throw Error('unmatched failure key was serialized');
    },
  };
  const result = inspect();
  assert.equal(result.diagnostics.graphDiagnostics.totals.originalOccurrences, 7);
  assert.equal(result.graphFailures.totals.originalOccurrences, 3);
});

test('non-string file fields retain the prefilter-independent JSON array normalization', () => {
  const { native, inspect } = fixture(),
    census = native.rawGraph.m4Contexts;
  census.observations[2].origin = undefined;
  const collector = createM4AttributionCollector();
  collector.add([census.observations[0]], 'entry-unsafe', 'unsafe');
  collector.add([census.observations[1]], 'entry-unsafe', 'unsafe');
  collector.add([census.observations[2]], 'entry-incomplete', 'why');
  collector.add([census.observations[2]], 'entry-incomplete', 'why');
  census.attributions = collector.entries();
  native.rawGraph.incomplete = [{ file: null, reason: 'why', occurrences: 2 }];
  const group = inspect().diagnostics.graphDiagnostics.groups[0];
  assert.equal(group.key, '[null,"why"]');
  assert.deepEqual(group.indices, [0]);
  assert.equal(group.residualOccurrences, 0);
});
