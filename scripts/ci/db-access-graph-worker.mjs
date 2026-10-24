import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { prepareGuardModel, completeGuardPreparation } from './db-access-prepare.mjs';
import { inspectOwnedGraphOrigins } from './db-access-graph.mjs';
import { assertWorkerCode, graphSnapshot } from './db-access-graph-workers.mjs';
if (isMainThread || !parentPort) throw new Error('incomplete: invalid graph worker entry');
assertWorkerCode(workerData.repoRoot);
const model = prepareGuardModel(workerData.repoRoot);
const snapshot = graphSnapshot(model);
assertWorkerCode(workerData.repoRoot);
let started = false;
parentPort.on('message', input => {
  if (started || input?.type !== 'RUN' || input.snapshot !== snapshot)
    throw new Error('incomplete: invalid owned graph RUN');
  started = true;
  if (graphSnapshot(model) !== snapshot) throw new Error('incomplete: startup source drift');
  const prepared = completeGuardPreparation(model, input);
  for (const reason of input.initialUnknown) prepared.provenance.analysisUnknown.add(reason);
  const graph = inspectOwnedGraphOrigins(
    prepared.model,
    prepared.provenance,
    prepared.inventory,
    prepared.adoption.critical,
    prepared.providerUnit,
    input.origins
  );
  if (graphSnapshot(prepared) !== snapshot) throw new Error('incomplete: worker source drift');
  assertWorkerCode(workerData.repoRoot);
  parentPort.postMessage({
    type: 'RESULT',
    snapshot,
    origins: input.origins,
    failures: graph.failures.map(row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))
    ),
    incomplete: graph.incomplete,
    incompleteRawCount: graph.incompleteRawCount,
    reachedTestSources: [...graph.reachedTestSources],
  });
  parentPort.close();
});
parentPort.postMessage({ type: 'READY', snapshot });
