import { m4NativePrerequisites } from './db-access-m4-native-prerequisite.mjs';
import { classifyStatusReturnEquivalence } from './db-access-status-return-equivalence.mjs';
import { classifyDefaultEmailEquivalence } from './db-access-default-email-equivalence.mjs';
import { classifyClaimHistoryCorrespondence } from './db-access-claim-history-correspondence.mjs';
import { proofReport } from './db-access-proof-report.mjs';
import { runtimeProofObligations } from './db-access-runtime-obligations.mjs';
import { digest } from './db-access-trust.mjs';
import { isUnsafe } from './db-access-inventory.mjs';
import { priorControlsFor } from './db-access-m4-prior-preparation.mjs';
import { rootDiagnostics } from './db-access-root-diagnostics.mjs';

const publicEntry = entry =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('_')));

export function finalizeGuardAnalysis(prepared, graph, captureRaw = false) {
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
  let claimHistoryPriorRow;
  if ([...inventory.changed].some(file => trusted.has(file))) {
    const prior = priorControlsFor(prepared);
    // An incomplete adoption classification cannot erase the prior scoped-control obligation.
    for (const reason of prior.analysisUnknown) {
      graph.incomplete.push({
        file: '<adoption-analysis>',
        reason,
        occurrences: 1,
      });
      graph.incompleteRawCount += 1;
    }
    statusReturnPriorRow = prior.statusReturnPriorRow;
    claimHistoryPriorRow = prior.claimHistoryPriorRow;
    priorScoped = new Set(prior.priorScoped);
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
  const raw = captureRaw
    ? {
        rawFailures: [...failures.values()],
        rawDiagnostics: [...graph.incomplete],
        rawDiagnosticCount: graph.incompleteRawCount,
      }
    : undefined;
  const defaultEmailEquivalence = classifyDefaultEmailEquivalence(prepared, graph, failures);
  const statusReturnEquivalence = classifyStatusReturnEquivalence(
    prepared,
    graph,
    failures,
    statusReturnPriorRow
  );
  const claimHistoryCorrespondence = classifyClaimHistoryCorrespondence(
    prepared,
    graph,
    failures,
    claimHistoryPriorRow
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
  const m4Prerequisites = providerUnit?.m4Proof
    ? m4NativePrerequisites(providerUnit.m4Proof, prepared.m4NativeInventory, graph, failures)
    : undefined;
  const unresolvedIncomplete = [
    ...crmObligations.remaining,
    ...(m4Prerequisites?.unresolved ?? []),
  ];
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
  if (unresolvedIncomplete.length) status = 'incomplete';
  else if (failingNewEntries.length) status = 'fail';
  const report = {
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
    claimHistoryCorrespondence,
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
    unresolvedIncomplete,
    m4Prerequisites,
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
  return { report, ...raw };
}
