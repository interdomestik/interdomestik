import {
  captureStatusReturnPriorRow,
  classifyStatusReturnEquivalence,
} from './db-access-status-return-equivalence.mjs';
import { classifyDefaultEmailEquivalence } from './db-access-default-email-equivalence.mjs';
import { startGraphWorkerPool } from './db-access-graph-worker-pool.mjs';
import { assertWorkerCode } from './db-access-graph-workers.mjs';
import { isMainThread } from 'node:worker_threads';
import { runParallelGraph, graphSnapshot, encodeInventory } from './db-access-graph-workers.mjs';
import { prepareGuard } from './db-access-prepare.mjs';
import { proofReport } from './db-access-proof-report.mjs';
import { runtimeProofObligations } from './db-access-runtime-obligations.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { ADOPTION } from './db-access-adoption.mjs';
import { digest } from './db-access-trust.mjs';
import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory, isUnsafe } from './db-access-inventory.mjs';
import { inspectChangedEdges } from './db-access-graph.mjs';
import { rootDiagnostics } from './db-access-root-diagnostics.mjs';

const publicEntry = entry =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('_')));

function finalizeGuard(prepared, graph) {
  const {
    repoRoot,
    adoption,
    providerPolicy,
    trusted,
    reviewedBoundaryChanges,
    baselineBytes,
    baseline,
    model,
    providerUnit,
    providerFiles,
    producerHarnessFiles,
    namedProofFiles,
    provenance,
    inventory,
    providerEntries,
    directChanges,
    moduleTargets,
    firstInvalidatingDependency,
  } = prepared;
  // A test filename never exempts an inventoried operation, so DB-looking mocks stay unsafe
  // until separately source-proved precision exists.
  const newEntries = inventory.entries.filter(entry => !entry.historicalDebt);
  // A transaction proves connection context, not equivalent owner/role/admission controls.
  // Existing scoped files are immutable at executable granularity in this epoch;
  // deletion and ambient-to-context remediation remain possible.
  let priorScoped = new Set();
  let statusReturnPriorRow;
  if ([...inventory.changed].some(file => trusted.has(file))) {
    const beforeModel = createSourceModel(trusted, trusted);
    const beforeProvenance = createProvenance(beforeModel);
    const before = collectInventory(beforeModel, beforeProvenance, trusted);
    // An incomplete adoption classification cannot erase the prior scoped-control obligation.
    for (const reason of beforeProvenance.analysisUnknown) {
      graph.incomplete.push({
        file: '<adoption-analysis>',
        reason,
        occurrences: 1,
      });
      graph.incompleteRawCount += 1;
    }
    statusReturnPriorRow = captureStatusReturnPriorRow(before.entries);
    priorScoped = new Set(
      before.entries
        .filter(entry => entry.tenantPosture === 'tenant-context')
        .map(entry => entry.file)
    );
  }
  const changedScopedControls = newEntries.filter(
    entry => priorScoped.has(entry.file) && !providerFiles.has(entry.file)
  );
  // A single operation may be reached from several changed roots. Keep every witness in the
  // diagnostic report even though the verdict counts the operation identity only once.
  const mountsByIdentity = new Map();
  for (const entry of graph.failures) {
    const mounts = mountsByIdentity.get(entry.identity) ?? new Set();
    mounts.add(entry.mountedFrom);
    mountsByIdentity.set(entry.identity, mounts);
  }
  const failures = new Map();
  for (const entry of [
    ...newEntries.filter(
      entry =>
        !providerFiles.has(entry.file) &&
        !producerHarnessFiles.has(entry.file) &&
        !namedProofFiles.has(entry.file) &&
        isUnsafe(entry)
    ),
    ...graph.failures,
    ...changedScopedControls.map(entry => ({
      ...entry,
      reason: 'existing scoped executable controls changed; root epoch cannot certify equivalence',
    })),
  ])
    failures.set(entry.identity, entry);
  const defaultEmailEquivalence = classifyDefaultEmailEquivalence(prepared, graph, failures);
  const statusReturnEquivalence = classifyStatusReturnEquivalence(
    prepared,
    graph,
    failures,
    statusReturnPriorRow
  );
  const { messageObligations, observedMounts, crmObligations } = runtimeProofObligations({
    providerUnit,
    failures,
    graph,
    directChanges,
    firstInvalidatingDependency,
    newEntries,
    scannedCount: inventory.entries.length,
    baselineCount: baseline.entries.length,
  });
  const failingNewEntries = [...failures.values()].map(entry => {
    const publicFailure = publicEntry(entry);
    const mounts = mountsByIdentity.get(entry.identity);
    if (mounts) publicFailure.mountedFromAll = [...mounts];
    return publicFailure;
  });
  const counts = {};
  for (const entry of inventory.entries)
    counts[entry.tenantPosture] = (counts[entry.tenantPosture] ?? 0) + 1;
  let status = 'pass';
  if (crmObligations.remaining.length) status = 'incomplete';
  else if (failingNewEntries.length) status = 'fail';
  return {
    status,
    ...(providerUnit
      ? {
          providerUnit: {
            ...providerUnit,
            runtimeProducerRequired: providerPolicy.runtimeEnforcement,
            ...proofReport({
              inventory,
              namedProofFiles,
              messageObligations,
              crmObligations,
              producerHarnessFiles,
              providerEntries,
              providerPolicy,
            }),
          },
        }
      : {}),
    defaultEmailEquivalence,
    statusReturnEquivalence,
    trustedCommit: adoption.commit,
    trustedTree: adoption.tree,
    historicalBaselineSha256: digest(baselineBytes),
    baselineCount: baseline.entries.length,
    scannedCount: inventory.entries.length,
    newCount: newEntries.length,
    failingNewCount: failingNewEntries.length,
    newEntries: newEntries.map(publicEntry),
    failingNewEntries,
    mountEvidence: observedMounts,
    rootDiagnostics: rootDiagnostics(moduleTargets, directChanges, firstInvalidatingDependency),
    incomplete: graph.incomplete,
    unresolvedIncomplete: crmObligations.remaining,
    incompleteRawCount: graph.incompleteRawCount,
    reviewedBoundaryChanges,
    counts: { byTenantPosture: counts },
    limits: [
      ...(providerUnit
        ? [
            'Provider source authentication is static only; the immutable external workflow must execute the bound runtime producer before admission. No receipt or green check name authorizes this transition.',
          ]
        : []),
      'Executable file changes conservatively invalidate ambient debt, including unrelated UI text/classes; transaction remediation or separately reviewed precision work is required.',
      'Bounded static evidence, not runtime RLS or general JavaScript proof.',
      'Tenant/owner values and authorization equivalence, including relocated scoped code or changed caller values, are not proved; arbitrary external monkeypatching and non-awaited async completion remain outside the claim.',
      'Consumer invalidation is intentionally file-coarse and may overblock dependency changes.',
      'Unknown, recursive, computed and escaped local executable edges fail closed.',
      'Existing scoped executable changes require separately reviewed precision/epoch evolution; a canonical transaction alone does not certify authorization equivalence.',
      'Root epoch is immutable; helper/policy evolution requires a separately reviewed implementation.',
    ],
  };
}

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
  return finalizeGuard(prepared, graph);
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
  const pool = startGraphWorkerPool(repoRoot);
  try {
    const prepared = prepareGuard(repoRoot, adoption);
    const graph = await runParallelGraph(
      prepared,
      {
        snapshot: graphSnapshot(prepared),
        inventory: encodeInventory(prepared),
      },
      pool
    );
    return finalizeGuard(prepared, graph);
  } finally {
    await pool.close();
  }
}

export { runGuardCli, runGuardCliParallel } from './db-access-cli.mjs';
