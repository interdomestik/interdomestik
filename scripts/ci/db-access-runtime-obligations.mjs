import { crmProofObligations } from './db-access-crm-proof-source.mjs';
import { messageProofObligations } from './db-access-message-proof-source.mjs';
import { mountEvidence } from './db-access-mount-evidence.mjs';

export function runtimeProofObligations({
  providerUnit,
  failures,
  graph,
  directChanges,
  firstInvalidatingDependency,
  newEntries,
  scannedCount,
  baselineCount,
}) {
  const observedMounts = mountEvidence(
    directChanges,
    firstInvalidatingDependency,
    graph,
    graph.incomplete.length > 0
  );
  // Classification is one transaction: a rejected join must not erase either
  // the computed inventory or any provisional failure. Retaining the complete
  // report is diagnostic only; the rejection remains an unresolved obligation.
  const provisional = new Map(failures);
  try {
    const messageObligations = messageProofObligations(
      providerUnit?.messageProof,
      provisional,
      graph.incomplete
    );
    const crmObligations = crmProofObligations(providerUnit?.crmProof, {
      failures: provisional,
      incomplete: messageObligations.remaining,
      mountEvidence: observedMounts,
      newEntries,
      scannedCount,
      baselineCount,
    });
    failures.clear();
    for (const [key, value] of provisional) failures.set(key, value);
    return { messageObligations, observedMounts, crmObligations };
  } catch (error) {
    const rejection = {
      file: '<runtime-proof-join>',
      reason: error instanceof Error ? error.message : String(error),
      occurrences: 1,
    };
    graph.incomplete.push(rejection);
    graph.incompleteRawCount += 1;
    return {
      messageObligations: { operations: [], unknown: [], remaining: graph.incomplete },
      observedMounts,
      crmObligations: {
        operations: [],
        diagnostics: [],
        remaining: graph.incomplete,
        runtimeAdmission: false,
        classificationRejected: true,
        rejection,
      },
    };
  }
}
