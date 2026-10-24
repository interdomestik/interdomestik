import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { prepareNativeGraphWorker } from './db-access-evaluator.mjs';
import { inspectOwnedGraphOrigins } from './db-access-graph.mjs';
import { assertWorkerCode, graphSnapshot } from './db-access-graph-workers.mjs';
if (isMainThread || !parentPort) throw new Error('incomplete: invalid graph worker entry');
assertWorkerCode(workerData.repoRoot);
const prepared = prepareNativeGraphWorker(workerData.repoRoot, workerData);
for (const reason of workerData.initialUnknown) prepared.provenance.analysisUnknown.add(reason);
const graph = inspectOwnedGraphOrigins(
  prepared.model,
  prepared.provenance,
  prepared.inventory,
  prepared.adoption.critical,
  prepared.providerUnit,
  workerData.origins
);
if (graphSnapshot(prepared) !== workerData.snapshot)
  throw new Error('incomplete: worker source drift');
assertWorkerCode(workerData.repoRoot);
parentPort.postMessage({
  snapshot: workerData.snapshot,
  origins: workerData.origins,
  failures: graph.failures.map(row =>
    Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')))
  ),
  incomplete: graph.incomplete,
  incompleteRawCount: graph.incompleteRawCount,
  reachedTestSources: [...graph.reachedTestSources],
});
