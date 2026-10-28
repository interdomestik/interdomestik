import {
  authorizeM4WorkerInput,
  assertM4HydratedInventory,
  m4WorkerResult,
  m4WorkerDone,
} from './db-access-m4-worker-input.mjs';
import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { prepareGuardModel, completeGuardPreparation } from './db-access-prepare.mjs';
import { createGraphTraversal } from './db-access-graph-core.mjs';
import { assertWorkerCode, graphSnapshot } from './db-access-graph-workers.mjs';
if (isMainThread || !parentPort) throw new Error('incomplete: invalid graph worker entry');
assertWorkerCode(workerData.repoRoot);
const model = prepareGuardModel(workerData.repoRoot),
  snapshot = graphSnapshot(model);
assertWorkerCode(workerData.repoRoot);
let session,
  prepared,
  lastJob = -1,
  stopped = false;
parentPort.on('message', input => {
  if (stopped || input?.snapshot !== snapshot)
    throw new Error('incomplete: invalid batch session snapshot');
  if (input.type === 'STOP') {
    stopped = true;
    if (graphSnapshot(model) !== snapshot) throw new Error('incomplete: worker source drift');
    assertWorkerCode(workerData.repoRoot);
    parentPort.postMessage({
      type: 'DONE',
      snapshot,
      ...(input.m4Transport ? { m4Done: m4WorkerDone(input, model) } : {}),
    });
    parentPort.close();
    return;
  }
  if (input.type !== 'RUN' || !Number.isSafeInteger(input.jobId) || input.jobId <= lastJob)
    throw new Error('incomplete: invalid graph batch sequence');
  lastJob = input.jobId;
  if (!session) {
    if (graphSnapshot(model) !== snapshot) throw new Error('incomplete: startup source drift');
    if (model.providerUnit?.m4Proof) authorizeM4WorkerInput(input, model);
    prepared = completeGuardPreparation(model, input);
    if (model.providerUnit?.m4Proof) assertM4HydratedInventory(input, prepared);
    for (const reason of input.initialUnknown) prepared.provenance.analysisUnknown.add(reason);
    session = createGraphTraversal(
      prepared.model,
      prepared.provenance,
      prepared.inventory,
      prepared.adoption.critical,
      prepared.providerUnit
    );
  } else if (input.inventory !== undefined || input.initialUnknown !== undefined)
    throw new Error('incomplete: repeated batch setup');
  const graph = session.run(input.origins);
  parentPort.postMessage({
    ...(model.providerUnit?.m4Proof ? { m4TransportAck: m4WorkerResult(input) } : {}),
    type: 'RESULT',
    snapshot,
    jobId: input.jobId,
    origins: input.origins,
    failures: graph.failures.map(row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))
    ),
    incomplete: graph.incomplete,
    incompleteRawCount: graph.incompleteRawCount,
    reachedTestSources: [...graph.reachedTestSources],
    ...(graph.m4Contexts ? { m4Contexts: graph.m4Contexts } : {}),
  });
});
parentPort.postMessage({
  type: 'READY',
  snapshot,
  channelId: workerData.m4ChannelId,
});
