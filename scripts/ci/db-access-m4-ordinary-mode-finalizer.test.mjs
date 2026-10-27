import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modeFixture } from './db-access-m4-mode.fixture.mjs';
import { fullModeFinalizer } from './db-access-m4-mode-finalizer.fixture.mjs';

test('actual finalizer preserves immutable ordinary axis and complete parent diagnostics', async t => {
  const f = await modeFixture(),
    { state, graph, evaluator, native } = f;
  const finalizer = await fullModeFinalizer(f);
  const merged = () => graph.mergeOwnedGraphs(state.prepared, state.partitions, state.results);
  const parallel = async () =>
    graph.runParallelGraph(state.prepared, state.input, await f.createPool());
  const expected = before => [
    ...before,
    ...state.priorUnknown.map(reason => ({ file: '<adoption-analysis>', reason, occurrences: 1 })),
  ];
  try {
    await t.test(
      'parallel actual prior UNKNOWN and raw report rows/counts are conserved exactly',
      async () => {
        const value = await parallel(),
          before = structuredClone(value.incomplete),
          raw = value.incompleteRawCount;
        const observations = structuredClone(value.m4Contexts),
          failures = structuredClone(value.failures);
        const result = finalizer.finalizeGuardAnalysis(state.prepared, value, true);
        assert.equal(result.report.status, 'incomplete');
        assert.deepEqual(result.rawDiagnostics, expected(before));
        assert.deepEqual(result.report.incomplete, expected(before));
        assert.equal(result.rawDiagnosticCount, raw + 2);
        assert.equal(result.report.incompleteRawCount, raw + 2);
        assert.deepEqual(value.incomplete, before);
        assert.equal(value.incompleteRawCount, raw);
        assert.deepEqual(value.m4Contexts, observations);
        assert.deepEqual(value.failures, failures);
        assert.notEqual(result.report.incomplete, value.incomplete);
        assert.equal(result.report.m4Prerequisites.ordinaryObservationOnly, true);
        assert.equal(result.report.m4Prerequisites.runtimeAdmission, false);
        graph.assertOwnedM4ObservationGraph(value);
        const replay = finalizer.finalizeGuardAnalysis(state.prepared, value, true);
        assert.deepEqual(replay.rawDiagnostics, result.rawDiagnostics);
        assert.equal(replay.rawDiagnosticCount, result.rawDiagnosticCount);
        assert.notEqual(replay.report.incomplete, result.report.incomplete);
        assert.deepEqual(value.incomplete, before);
      }
    );
    await t.test(
      'synchronous actual entry/finalizer conserves prior rows without minting worker proof',
      () => {
        state.syncGraph = merged();
        const before = structuredClone(state.syncGraph.incomplete),
          raw = state.syncGraph.incompleteRawCount,
          reads = state.priorReads;
        const result = evaluator.evaluateGuard('/unit');
        assert.deepEqual(result.incomplete, expected(before));
        assert.equal(result.incompleteRawCount, raw + 2);
        assert.equal(state.priorReads, reads + 1);
        assert.deepEqual(state.syncGraph.incomplete, before);
        assert.equal(state.syncGraph.incompleteRawCount, raw);
        assert.equal(result.m4Prerequisites.observationMode, 'synchronous');
        assert.equal(result.m4Prerequisites.ownedWorkerTransportVerified, false);
        evaluator.assertOwnedOrdinarySynchronousGraph(
          state.syncGraph,
          state.prepared.m4NativeInventory,
          state.source
        );
      }
    );
    await t.test(
      'trusted runtime append remains in full report and immutable original axis stays exact',
      async () => {
        const value = await parallel(),
          before = structuredClone(value.incomplete),
          raw = value.incompleteRawCount;
        state.runtimeReject = true;
        const rejection = {
          file: '<runtime-proof-join>',
          reason: 'bounded actual runtime rejection',
          occurrences: 1,
        };
        try {
          const result = finalizer.finalizeGuardAnalysis(state.prepared, value, true);
          assert.deepEqual(result.rawDiagnostics, expected(before));
          assert.deepEqual(result.report.incomplete, [...expected(before), rejection]);
          assert.equal(result.rawDiagnosticCount, raw + 2);
          assert.equal(result.report.incompleteRawCount, raw + 3);
          assert.deepEqual(value.incomplete, before);
          assert.equal(state.runtimeGraph.m4Contexts.unresolved, state.runtimeGraph.incomplete);
          assert.notEqual(state.runtimeGraph.incomplete, value.incomplete);
          assert.equal(state.runtimeGraph.failures, value.failures);
          assert.equal(state.runtimeGraph.m4Contexts.observations, value.m4Contexts.observations);
          assert.equal(state.runtimeGraph.m4Contexts.frames, value.m4Contexts.frames);
          graph.assertOwnedM4ObservationGraph(value);
        } finally {
          state.runtimeReject = false;
        }
      }
    );
    await t.test(
      'synchronous actual runtime join rejection preserves worker axis and public diagnostics',
      () => {
        state.syncGraph = merged();
        const before = structuredClone(state.syncGraph.incomplete),
          raw = state.syncGraph.incompleteRawCount;
        state.runtimeReject = true;
        try {
          const result = evaluator.evaluateGuard('/unit');
          assert.deepEqual(result.incomplete, [
            ...expected(before),
            {
              file: '<runtime-proof-join>',
              reason: 'bounded actual runtime rejection',
              occurrences: 1,
            },
          ]);
          assert.equal(result.incompleteRawCount, raw + 3);
          assert.deepEqual(state.syncGraph.incomplete, before);
          assert.equal(state.syncGraph.incompleteRawCount, raw);
          assert.equal(state.runtimeGraph.m4Contexts.unresolved, state.runtimeGraph.incomplete);
          assert.notEqual(state.runtimeGraph.incomplete, state.syncGraph.incomplete);
          evaluator.assertOwnedOrdinarySynchronousGraph(
            state.syncGraph,
            state.prepared.m4NativeInventory,
            state.source
          );
        } finally {
          state.runtimeReject = false;
        }
      }
    );
    await t.test(
      'private finalizer retains original graph mutation and raw capture timing unchanged',
      async () => {
        const value = await graph.runParallelGraph(
            state.prepared,
            state.input,
            await f.createPool(state.loader)
          ),
          before = structuredClone(value.incomplete),
          raw = value.incompleteRawCount;
        state.runtimeReject = true;
        try {
          const result = finalizer.finalizeGuardAnalysis(state.prepared, value, true);
          assert.equal(result.report.incomplete, value.incomplete);
          assert.deepEqual(result.rawDiagnostics, expected(before));
          assert.equal(result.rawDiagnosticCount, raw + 2);
          assert.equal(value.incompleteRawCount, raw + 3);
          assert.equal(state.runtimeGraph, value);
          assert.equal(result.report.m4Prerequisites.ownedWorkerTransportVerified, true);
          assert.equal(
            Object.hasOwn(result.report.m4Prerequisites, 'ordinaryObservationOnly'),
            false
          );
          assert.equal(value.m4Contexts.unresolved, value.incomplete);
        } finally {
          state.runtimeReject = false;
        }
      }
    );
    await t.test(
      'arbitrary original diagnostics, count, failure, sidecar or transport edits cannot use parent augmentation',
      async () => {
        for (const mutate of [
          g =>
            g.incomplete.push({
              file: '<adoption-analysis>',
              reason: state.priorUnknown[0],
              occurrences: 1,
            }),
          g => g.incompleteRawCount++,
          g => g.failures.pop(),
          g => g.m4Contexts.observations.pop(),
          g => {
            g.m4WorkerTransport = { forged: true };
          },
        ]) {
          const value = await parallel();
          mutate(value);
          assert.throws(
            () => finalizer.finalizeGuardAnalysis(state.prepared, value, true),
            /changed|mixed/
          );
        }
        state.syncGraph = merged();
        evaluator.evaluateGuard('/unit');
        state.syncGraph.incompleteRawCount++;
        assert.throws(
          () => finalizer.finalizeGuardAnalysis(state.prepared, state.syncGraph, true),
          /changed/
        );
      }
    );
    await t.test(
      'ordinary copies and replayed pool results cannot register through the finalizer',
      async () => {
        const value = await parallel();
        for (const copy of [{ ...value }, structuredClone(value)])
          assert.throws(
            () => finalizer.finalizeGuardAnalysis(state.prepared, copy, true),
            /foreign|unowned/
          );
        const pool = await f.createPool();
        await graph.runParallelGraph(state.prepared, state.input, pool);
        await assert.rejects(graph.runParallelGraph(state.prepared, state.input, pool), /reused/);
      }
    );
  } finally {
    finalizer.close();
    await f.cleanup();
  }
});
