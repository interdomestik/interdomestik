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
  const messageObligations = messageProofObligations(
    providerUnit?.messageProof,
    failures,
    graph.incomplete
  );
  const observedMounts = mountEvidence(
    directChanges,
    firstInvalidatingDependency,
    graph,
    graph.incomplete.length > 0
  );
  const crmObligations = crmProofObligations(providerUnit?.crmProof, {
    failures,
    incomplete: messageObligations.remaining,
    mountEvidence: observedMounts,
    newEntries,
    scannedCount,
    baselineCount,
  });
  return { messageObligations, observedMounts, crmObligations };
}
