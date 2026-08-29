import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { evaluatePrGatePolicy } from './ci/pr-gate-policy-lib.mjs';
import { compareText } from './slice-rehearse-canonical.mjs';
import { deriveCapacityProposal } from './slice-rehearse-capacity.mjs';
import { appendCapacityEvaluation } from './slice-rehearse-capacity-existing.mjs';
import { canonicalJson, sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { evaluateEvidenceReceipts } from './slice-rehearse-evidence.mjs';
import { buildRehearsalReport } from './slice-rehearse-envelope.mjs';
import {
  resolveOperationalContracts,
  routineOperationName,
} from './slice-rehearse-operation-contracts.mjs';
import { normalizeRepositoryFacts } from './slice-rehearse-repository-facts.mjs';
import {
  evidenceAfterPlannedOperations,
  evaluateWriterPolicy,
  repositoryAuthorityStops,
  requiredEvidenceProofDeficit,
} from './slice-rehearse-writer-policy.mjs';
export {
  evidenceAfterPlannedOperations,
  requiredEvidenceProofDeficit,
} from './slice-rehearse-writer-policy.mjs';
export { deriveOperationalEnvelope } from './slice-rehearse-core.mjs';
function sorted(items) {
  return items.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || canonicalJson(left).localeCompare(canonicalJson(right))
  );
}

export function evaluateRehearsal({
  manifest,
  repository,
  budget,
  budgetText,
  protectedBudget,
  protectedBudgetText,
  baselineBudgetBytes,
}) {
  const normalized = validateRehearsalManifest(manifest);
  const repo = normalizeRepositoryFacts(repository);
  const proposal = deriveCapacityProposal({
    budget,
    budgetText,
    protectedBudget,
    protectedBudgetText,
    manifest: normalized,
    baselineBudgetBytes,
    capacityOwnerDeltas: repo.capacityOwnerDeltas,
    writerDeltas: repo.writerDeltas,
  });
  const deficits = [...(proposal.deficits ?? [])];
  const authorityStops = [
    ...repositoryAuthorityStops(normalized, repo),
    ...(proposal.authorityStops ?? []),
  ];
  const writerMapDigest = sha256(canonicalJson(normalized.writerPaths));
  const operationResolution = resolveOperationalContracts(normalized.routineOperations, {
    ...repo,
    writerMapDigest,
  });
  for (const rejection of operationResolution.rejected) {
    authorityStops.push({ code: 'envelope:operation-precondition-unverified', ...rejection });
  }
  const advancedOutsideWriters = repo.protectedMainAdvancedPaths.filter(
    path => !normalized.writerPaths.includes(path)
  );
  if (advancedOutsideWriters.length) {
    deficits.push({
      code: 'repository:protected-main-advanced',
      paths: advancedOutsideWriters,
      coveredBy: 'fresh_worktree_patch_replay',
    });
  }
  appendCapacityEvaluation({
    proposal,
    repo,
    deficits,
    authorityStops,
    categories: CAPACITY_CATEGORIES,
  });
  const gatePolicy = evaluatePrGatePolicy({
    eventName: 'pull_request',
    draft: true,
    changedFiles: normalized.writerPaths,
    changedFilesComplete: true,
  });
  if (normalized.proof.fullGateRequired && !gatePolicy.runFull)
    deficits.push({ code: 'proof:full-gate', coveredBy: 'apply_full_gate_label' });

  const writerPolicy = evaluateWriterPolicy(normalized, repo, proposal.budget);
  deficits.push(...writerPolicy.deficits);
  authorityStops.push(...writerPolicy.authorityStops);
  if (
    normalized.topology.closeoutMode === 'projection-only' &&
    normalized.topology.repairPaths.length
  ) {
    deficits.push({
      code: 'topology:repair-before-closeout',
      paths: normalized.topology.repairPaths,
      coveredBy: 'sequence_prerequisite_before_projection',
    });
  }

  const commandDigest = sha256(canonicalJson(normalized.proof.commands));
  const expectedByLane = Object.fromEntries(
    normalized.proof.heavyLanes.map(lane => [
      lane,
      {
        headSha: repo.headSha,
        treeSha: repo.treeSha,
        commandDigest,
        workflowDigest: normalized.proof.workflowDigest,
        substrateDigest: normalized.proof.substrateDigest,
        writerMapDigest,
      },
    ])
  );
  const evidenceResult = evidenceAfterPlannedOperations(
    evaluateEvidenceReceipts({
      receipts: normalized.evidenceReceipts,
      heavyLanes: normalized.proof.heavyLanes,
      expectedByLane,
      verifiedEvidenceKeysByLane: repo.verifiedEvidenceKeysByLane ?? {},
      dirtyWriterPaths: repo.dirtyPaths.filter(path => normalized.writerPaths.includes(path)),
    }),
    deficits,
    operationResolution.granted
  );
  const evidenceProofDeficit = requiredEvidenceProofDeficit(evidenceResult);
  if (evidenceProofDeficit) deficits.push(evidenceProofDeficit);
  const requiredOperations = [
    ...new Set(deficits.map(item => item.coveredBy).filter(Boolean)),
  ].sort(compareText);
  const missingOperations = requiredOperations.filter(
    operation => !normalized.routineOperations.map(routineOperationName).includes(operation)
  );
  if (missingOperations.length)
    authorityStops.push({ code: 'envelope:missing-operation', operations: missingOperations });

  return buildRehearsalReport({
    normalized,
    repo,
    proposal,
    operationResolution,
    evidenceResult,
    deficits: sorted(deficits),
    authorityStops: sorted(authorityStops),
    writerMapDigest,
  });
}
