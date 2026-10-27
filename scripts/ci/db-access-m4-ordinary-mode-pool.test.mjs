import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modeFixture } from './db-access-m4-mode.fixture.mjs';
// Actual pool/claim code with explicit source/worker/loader doubles, no real worker or admission.
test('ordinary/private transport mode matrix retains all protocol checks', async t => {
  const f = await modeFixture(),
    { state, pool } = f;
  const run = async (
    privateLoader,
    request = f.request(),
    partitions = state.partitions,
    input = state.input
  ) => pool.runOwnedGraphWorkerPool(await f.createPool(privateLoader), partitions, input, request);
  const reset = () => {
    state.changeResult = undefined;
    state.changeDone = undefined;
    state.sourceChanged = false;
    state.seal = 'unit-producer-seal';
  };
  try {
    await t.test(
      'ordinary request returns all rows/sidecars without private evidence',
      async () => {
        const rows = await run();
        assert.equal(rows.length, state.results.length);
        for (let i = 0; i < rows.length; i++)
          for (const key of [
            'failures',
            'incomplete',
            'incompleteRawCount',
            'reachedTestSources',
            'm4Contexts',
          ])
            assert.deepEqual(rows[i][key], state.results[i][key]);
        const value = pool.claimOwnedM4GraphTransport(rows);
        assert.equal(value.kind, 'ordinary-observation');
        assert.equal(value.proof.observationOnly, true);
        assert.equal(value.proof.loaderQualified, false);
        assert.equal(pool.isOwnedM4WorkerEvidence(value.proof), false);
        assert.throws(() => pool.assertM4WorkerEvidenceCurrent(value.proof), /foreign/);
        pool.assertM4ObservationEvidenceCurrent(value.proof);
        assert.equal(state.bound, 0);
        assert.throws(() => pool.claimOwnedM4GraphTransport(rows), /replayed/);
      }
    );
    await t.test('qualified request retains the existing private evidence realm', async () => {
      const rows = await run(state.loader),
        proof = pool.claimOwnedM4WorkerEvidence(rows);
      assert.equal(pool.isOwnedM4WorkerEvidence(proof), true);
      pool.assertM4WorkerEvidenceCurrent(proof);
      assert.throws(() => pool.assertM4ObservationEvidenceCurrent(proof), /ordinary/);
      assert.equal(state.bound, 1);
    });
    await t.test(
      'ordinary observations cannot bind or assert GraphLoader evidence even for an owned complete session',
      async () => {
        const rows = await run(),
          proof = pool.claimOwnedM4GraphTransport(rows).proof;
        assert.throws(
          () => f.loaderEvidence.bindM4GraphLoaderEvidence(state.loader, proof),
          /foreign/
        );
        state.loaderState.graphEvidence.add(proof);
        assert.throws(
          () => f.loaderEvidence.assertM4GraphLoaderEvidence(state.loader, proof),
          /foreign/
        );
        const privateRows = await run(state.loader),
          privateProof = pool.claimOwnedM4WorkerEvidence(privateRows);
        f.loaderEvidence.bindM4GraphLoaderEvidence(state.loader, privateProof);
        f.loaderEvidence.assertM4GraphLoaderEvidence(state.loader, privateProof);
        assert.throws(
          () =>
            f.loaderEvidence.bindM4GraphLoaderEvidence(state.loader, {
              ...privateProof,
            }),
          /foreign/
        );
      }
    );
    await t.test('ordinary results cannot be claimed through the private API', async () => {
      const rows = await run();
      assert.throws(() => pool.claimOwnedM4WorkerEvidence(rows), /not private evidence/);
      assert.throws(() => pool.claimOwnedM4GraphTransport(rows), /replayed/);
    });
    await t.test('wrong private capability never falls back to ordinary workers', async () => {
      const count = state.workers.length;
      await assert.rejects(run({ forged: true }), /foreign loader/);
      assert.equal(state.workers.length, count);
    });
    await t.test(
      'only undefined omits a loader; invalid supplied falsy handles never create workers',
      async () => {
        for (const handle of [null, false, 0, '']) {
          const before = state.workers.length;
          await assert.rejects(run(handle), /foreign loader/);
          assert.equal(state.workers.length, before);
        }
      }
    );
    await t.test('private capability without a request is refused', async () => {
      const value = await f.createPool(state.loader);
      await assert.rejects(
        pool.runOwnedGraphWorkerPool(value, state.partitions, state.input),
        /loader\/request/
      );
    });
    await t.test('ordinary fake and replayed requests are refused', async () => {
      await assert.rejects(run(undefined, JSON.parse(JSON.stringify(f.request()))), /request/);
      const request = f.request();
      await run(undefined, request);
      await assert.rejects(run(undefined, request), /replayed/);
    });
    await t.test('full inventory and complete ordered partitions remain mandatory', async () => {
      await assert.rejects(
        run(undefined, f.request(), state.partitions.slice(1)),
        /root partition/
      );
      const input = structuredClone(state.input);
      input.inventory.entries.pop();
      await assert.rejects(run(undefined, f.request(), state.partitions, input), /input mismatch/);
    });
    for (const label of ['missing', 'channel', 'inventory', 'final bookend'])
      await t.test(label + ' ACK refuses in ordinary and private modes', async () => {
        for (const loader of [undefined, state.loader]) {
          reset();
          if (label === 'final bookend')
            state.changeDone = message => {
              message.m4Done.sourcePolicyDigest = 'foreign';
            };
          else
            state.changeResult = result => {
              if (label === 'missing') delete result.m4TransportAck;
              else if (label === 'channel') result.m4TransportAck.channelId = 'foreign';
              else result.m4TransportAck.inventoryCount++;
            };
          await assert.rejects(run(loader), /acknowledgement|bookend/);
        }
        reset();
      });
    await t.test('producer and source drift remain terminal refusals in both modes', async () => {
      for (const loader of [undefined, state.loader])
        for (const source of [false, true]) {
          reset();
          state.changeDone = () => {
            if (source) state.sourceChanged = true;
            else state.seal = 'changed';
          };
          await assert.rejects(run(loader), /drift|changed/);
        }
      reset();
    });
    await t.test('copies of ordinary observations cannot become either evidence kind', async () => {
      const rows = await run(),
        value = pool.claimOwnedM4GraphTransport(rows);
      for (const copy of [{ ...value.proof }, JSON.parse(JSON.stringify(value.proof))]) {
        assert.equal(pool.isOwnedM4WorkerEvidence(copy), false);
        assert.throws(() => pool.assertM4ObservationEvidenceCurrent(copy), /foreign/);
      }
    });
  } finally {
    await f.cleanup();
  }
});
