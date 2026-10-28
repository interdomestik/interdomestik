import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modeFixture } from './db-access-m4-mode.fixture.mjs';
// Real merge/prerequisite/entry code, with explicit small source/worker execution doubles only.
test('ordinary raw report and synchronous mode never acquire private qualification', async t => {
  const f = await modeFixture(),
    { state, graph, native, evaluator } = f;
  const analyze = async loader =>
    graph.runParallelGraph(state.prepared, state.input, await f.createPool(loader));
  const report = value =>
    native.m4NativePrerequisites(state.source, state.prepared.m4NativeInventory, value, new Map());
  try {
    await t.test(
      'parallel ordinary graph preserves every raw failure/diagnostic/sidecar and remains incomplete',
      async () => {
        const expected = graph.mergeOwnedGraphs(state.prepared, state.partitions, state.results),
          before = JSON.stringify(state.results);
        const value = await analyze();
        assert.equal(Object.hasOwn(value, 'm4WorkerTransport'), false);
        assert.equal(value.failures.length, state.results.flatMap(x => x.failures).length);
        assert.deepEqual(
          value.m4Contexts.observations,
          state.results.flatMap(x => x.m4Contexts.observations)
        );
        assert.deepEqual(value.failures, expected.failures);
        assert.deepEqual(value.incomplete, expected.incomplete);
        assert.equal(value.incompleteRawCount, expected.incompleteRawCount);
        assert.deepEqual(value.m4Contexts, expected.m4Contexts);
        assert.deepEqual(value.reachedTestSources, expected.reachedTestSources);
        assert.equal(JSON.stringify(state.results), before);
        const result = report(value);
        assert.equal(result.observationMode, 'parallel');
        assert.equal(result.ordinaryObservationOnly, true);
        assert.equal(result.ownedWorkerTransportVerified, false);
        assert.equal(result.runtimeEvidenceAccepted, false);
        assert.equal(result.runtimeAdmission, false);
        assert.equal(result.contextCensusComplete, false);
        assert.equal(result.unresolved.length, 1);
        assert.match(result.unresolved[0].reason, /same-event executed runtime proof/);
        assert.throws(() => graph.assertOwnedGraphOutput(value), /unowned/);
        for (const copy of [{ ...value }, structuredClone(value)])
          assert.throws(() => report(copy), /foreign|unowned/);
        value.failures.pop();
        assert.throws(() => report(value), /changed/);
      }
    );
    await t.test(
      'qualified path retains private output/evidence and never receives ordinary status',
      async () => {
        const value = await analyze(state.loader),
          result = report(value);
        assert.equal(result.ownedWorkerTransportVerified, true);
        assert.equal(Object.hasOwn(result, 'ordinaryObservationOnly'), false);
        graph.assertOwnedGraphOutput(value);
        assert.throws(() => graph.assertOwnedM4ObservationGraph(value), /ordinary/);
      }
    );
    await t.test(
      'mixed or malformed private scope cannot fall through to valid ordinary observations',
      async () => {
        const value = await analyze();
        value.m4WorkerTransport = { forged: true };
        assert.throws(() => report(value), /mixed/);
        delete value.m4WorkerTransport;
        value.m4ObservationTransport = { ...value.m4ObservationTransport };
        assert.throws(() => report(value), /foreign/);
      }
    );
    await t.test(
      'synchronous canonical entry executes preparation/traversal once and records no worker proof',
      async () => {
        state.syncGraph = graph.mergeOwnedGraphs(state.prepared, state.partitions, state.results);
        const before = [state.preparedCalls, state.traversalCalls],
          result = evaluator.evaluateGuard('/unit');
        assert.deepEqual(
          [state.preparedCalls, state.traversalCalls],
          [before[0] + 1, before[1] + 1]
        );
        assert.equal(result.observationMode, 'synchronous');
        assert.equal(result.ownedWorkerTransportVerified, false);
        assert.equal(result.runtimeAdmission, false);
        assert.equal(Object.hasOwn(state.syncGraph, 'm4WorkerTransport'), false);
        assert.equal(Object.hasOwn(state.syncGraph, 'm4ObservationTransport'), false);
        assert.throws(() => graph.assertOwnedGraphOutput(state.syncGraph), /unowned/);
        state.syncGraph.incomplete.pop();
        assert.throws(() => report(state.syncGraph), /changed/);
      }
    );
    await t.test(
      'explicit fixture-adoption entry retains undefined provider policy and mints no M4 observation',
      () => {
        const saved = state.prepared.providerUnit,
          savedNative = state.prepared.m4NativeInventory;
        state.syncGraph = graph.mergeOwnedGraphs(state.prepared, state.partitions, state.results);
        state.prepared.providerUnit = undefined;
        state.prepared.m4NativeInventory = undefined;
        try {
          const result = evaluator.evaluateGuard('/unit', {
            fixtureAdoption: true,
          });
          assert.deepEqual(result, { fixtureAdoption: true });
          assert.equal(evaluator.isOwnedOrdinarySynchronousGraph(state.syncGraph), false);
          assert.equal(state.prepareArgs[2], undefined);
        } finally {
          state.prepared.providerUnit = saved;
          state.prepared.m4NativeInventory = savedNative;
        }
      }
    );
    await t.test('forged synchronous graph cannot be registered by a public DTO', () => {
      const value = graph.mergeOwnedGraphs(state.prepared, state.partitions, state.results);
      assert.equal(evaluator.isOwnedOrdinarySynchronousGraph(value), false);
      assert.throws(() => report(value), /scope/);
    });
    await t.test('synchronous producer drift refuses before ordinary ownership is minted', () => {
      state.syncGraph = graph.mergeOwnedGraphs(state.prepared, state.partitions, state.results);
      state.duringSync = () => {
        state.seal = 'changed';
      };
      assert.throws(() => evaluator.evaluateGuard('/unit'), /producer drift/);
      assert.equal(evaluator.isOwnedOrdinarySynchronousGraph(state.syncGraph), false);
      state.duringSync = undefined;
      state.seal = 'unit-producer-seal';
    });
  } finally {
    await f.cleanup();
  }
});
