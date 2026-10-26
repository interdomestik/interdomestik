import { startGraphWorkerPool } from './db-access-graph-worker-pool.mjs';
import { assertWorkerCode } from './db-access-graph-workers.mjs';
import { isMainThread } from 'node:worker_threads';
import { runParallelGraph, graphSnapshot, encodeInventory } from './db-access-graph-workers.mjs';
import { prepareGuard } from './db-access-prepare.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { ADOPTION } from './db-access-adoption.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { finalizeGuardAnalysis } from './db-access-finalize.mjs';

// Existing synchronous public API remains unchanged. No caller supplies graph observations.
export function evaluateGuard(
  repoRoot,
  adoption = ADOPTION,
  providerPolicy = adoption === ADOPTION ? PROVIDER_UNIT_POLICY : undefined
) {
  const prepared = prepareGuard(repoRoot, adoption, providerPolicy);
  const graph = inspectChangedEdges(
    prepared.model,
    prepared.provenance,
    prepared.inventory,
    adoption.critical,
    prepared.providerUnit
  );
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
