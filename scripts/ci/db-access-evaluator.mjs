import { outputShape, sameOutputShape } from './db-access-output-binding.mjs';
import { currentM4ProducerSeal } from './db-access-m4-worker-evidence.mjs';
import { startGraphWorkerPool } from './db-access-graph-worker-pool.mjs';
import { assertWorkerCode } from './db-access-graph-workers.mjs';
import { isMainThread } from 'node:worker_threads';
import { runParallelGraph, graphSnapshot, encodeInventory } from './db-access-graph-workers.mjs';
import { prepareGuard } from './db-access-prepare.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { ADOPTION } from './db-access-adoption.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { finalizeGuardAnalysis } from './db-access-finalize.mjs';

const ordinarySynchronousGraphs = new WeakMap();
export const isOwnedOrdinarySynchronousGraph = graph => ordinarySynchronousGraphs.has(graph);
export function assertOwnedOrdinarySynchronousGraph(graph, native, source) {
  const state = ordinarySynchronousGraphs.get(graph);
  if (
    !state ||
    state.native !== native ||
    state.source !== source ||
    state.producerSeal !== currentM4ProducerSeal() ||
    !sameOutputShape(state.output, graph)
  )
    throw Error('incomplete: foreign/changed ordinary synchronous graph');
}
// Existing synchronous API executes its original preparation/traversal itself; no registrar.
export function evaluateGuard(
  repoRoot,
  adoption = ADOPTION,
  providerPolicy = adoption === ADOPTION ? PROVIDER_UNIT_POLICY : undefined
) {
  const prepared = prepareGuard(repoRoot, adoption, providerPolicy);
  const producerSeal = prepared.m4NativeInventory ? currentM4ProducerSeal() : undefined;
  const graph = inspectChangedEdges(
    prepared.model,
    prepared.provenance,
    prepared.inventory,
    adoption.critical,
    prepared.providerUnit
  );
  if (prepared.m4NativeInventory) {
    if (producerSeal !== currentM4ProducerSeal())
      throw Error('incomplete: synchronous producer drift');
    ordinarySynchronousGraphs.set(graph, {
      native: prepared.m4NativeInventory,
      source: prepared.providerUnit.m4Proof,
      producerSeal,
      output: outputShape(graph),
    });
  }
  return finalizeGuardAnalysis(prepared, graph).report;
}

// Called only from the fixed worker module; no public CLI accepts worker input.
export function prepareNativeGraphWorker(repoRoot, input) {
  if (isMainThread) throw new Error('incomplete: worker preparation outside owned worker');
  const prepared = prepareGuard(repoRoot, ADOPTION, PROVIDER_UNIT_POLICY, input);
  if (graphSnapshot(prepared) !== input.snapshot)
    throw new Error('incomplete: worker source snapshot mismatch');
  return prepared;
}
export async function evaluateGuardParallel(repoRoot, adoption) {
  if (adoption !== ADOPTION) return evaluateGuard(repoRoot, adoption);
  assertWorkerCode(repoRoot);
  // Finish the parent's inventory before four independent worker preparations begin.
  const prepared = prepareGuard(repoRoot, adoption);
  const pool = startGraphWorkerPool(repoRoot);
  try {
    const graph = await runParallelGraph(
      prepared,
      {
        snapshot: graphSnapshot(prepared),
        inventory: encodeInventory(prepared),
      },
      pool
    );
    return finalizeGuardAnalysis(prepared, graph).report;
  } finally {
    await pool.close();
  }
}

export { runGuardCli, runGuardCliParallel } from './db-access-cli.mjs';
