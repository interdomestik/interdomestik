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
    parentPort.postMessage({ type: 'DONE', snapshot });
    parentPort.close();
    return;
  }
  if (input.type !== 'RUN' || !Number.isSafeInteger(input.jobId) || input.jobId <= lastJob)
    throw new Error('incomplete: invalid graph batch sequence');
  lastJob = input.jobId;
  if (!session) {
    if (graphSnapshot(model) !== snapshot) throw new Error('incomplete: startup source drift');
    prepared = completeGuardPreparation(model, input);
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
  });
});
parentPort.postMessage({ type: 'READY', snapshot });
