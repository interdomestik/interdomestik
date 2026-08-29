import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { evaluatePrGatePolicy } from './ci/pr-gate-policy-lib.mjs';
import { deriveCapacityProposal } from './slice-rehearse-capacity.mjs';
import {
  canonicalJson,
  canonicalModularityForPath,
  deriveOperationalEnvelope,
  sha256,
  validateRehearsalManifest,
} from './slice-rehearse-core.mjs';
import { evaluateEvidenceReceipts } from './slice-rehearse-evidence.mjs';
import {
  resolveOperationalContracts,
  routineOperationName,
} from './slice-rehearse-operation-contracts.mjs';
import {
  normalizeRepositoryFacts,
  repositoryAuthorityStops,
} from './slice-rehearse-repository-facts.mjs';
import { evaluateWriterPolicy } from './slice-rehearse-writer-policy.mjs';
export { deriveOperationalEnvelope } from './slice-rehearse-core.mjs';
function sorted(items) {
  return items.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || canonicalJson(left).localeCompare(canonicalJson(right))
  );
}

function capacityStop(authorityStops, code, actual, limit) {
  if (actual > limit) authorityStops.push({ code, actual, limit });
}

const IDENTITY_CHANGING_OPERATIONS = new Set([
  'add_focused_test',
  'bounded_force_with_lease_rebuild',
  'derived_capacity_rebind',
  'extract_cohesive_helper',
  'fresh_worktree_patch_replay',
  'split_focused_test',
]);

export function evidenceAfterPlannedOperations(evidence, deficits, grantedOperations = []) {
  const planned = new Set([
    ...deficits.map(deficit => deficit.coveredBy).filter(Boolean),
    ...grantedOperations.map(routineOperationName),
  ]);
  const invalidated = [...planned].some(operation => IDENTITY_CHANGING_OPERATIONS.has(operation));
  if (!invalidated) return evidence;
  return {
    ...evidence,
    missingLanes: [...new Set([...evidence.missingLanes, ...evidence.reusableLanes])].sort(
      (left, right) => left.localeCompare(right)
    ),
  };
}

export function requiredEvidenceProofDeficit(evidence) {
  return evidence.missingLanes.length
    ? {
        code: 'evidence:heavy-proof-required',
        lanes: evidence.missingLanes,
        coveredBy: 'rerun_invalidated_proof',
      }
    : null;
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
  const capacityAlreadyApplied = proposal.worktreeBudget?.state === 'candidate-exact';
  if (
    proposal.mode === 'derived' &&
    !capacityAlreadyApplied &&
    proposal.allocation.maxTrackedFilesDelta
  ) {
    deficits.push({
      code: 'capacity:new-files',
      amount: proposal.allocation.maxTrackedFilesDelta,
      coveredBy: 'derived_capacity_rebind',
    });
  }
  if (
    proposal.mode === 'derived' &&
    !capacityAlreadyApplied &&
    proposal.allocation.maxTrackedBytesDelta
  ) {
    deficits.push({
      code: 'capacity:tracked-bytes',
      amount: proposal.allocation.maxTrackedBytesDelta,
      coveredBy: 'derived_capacity_rebind',
    });
  }
  if (proposal.mode === 'derived' && !capacityAlreadyApplied) {
    deficits.push({
      code: 'capacity:budget-self-size',
      amount: proposal.selfBytesDelta,
      coveredBy: 'derived_capacity_rebind',
    });
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
  capacityStop(
    authorityStops,
    'capacity:global-tracked-files',
    repo.tracked.files + (proposal.projectionHeadroom?.files ?? 0),
    proposal.budget.maxTrackedFiles
  );
  capacityStop(
    authorityStops,
    'capacity:global-tracked-bytes',
    repo.tracked.bytes + (proposal.projectionHeadroom?.bytes ?? 0),
    proposal.budget.maxTrackedBytes
  );
  for (const category of CAPACITY_CATEGORIES) {
    capacityStop(
      authorityStops,
      `capacity:global-category-bytes:${category}`,
      (repo.tracked.categoryBytes[category] ?? 0) +
        (proposal.projectionHeadroom?.categories[category] ?? 0),
      proposal.budget.maxCategoryBytes[category]
    );
  }
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
  ].sort();
  const missingOperations = requiredOperations.filter(
    operation => !normalized.routineOperations.map(routineOperationName).includes(operation)
  );
  if (missingOperations.length)
    authorityStops.push({ code: 'envelope:missing-operation', operations: missingOperations });

  const writerFactsDigest = sha256(
    canonicalJson({
      baseSha: repo.baseSha,
      capacityOwnerDeltas: repo.capacityOwnerDeltas,
      capacityBaseSha: repo.capacityBaseSha,
      committedChangedPaths: repo.committedChangedPaths,
      headSha: repo.headSha,
      mergeBaseSha: repo.mergeBaseSha,
      protectedMainAdvancedPaths: repo.protectedMainAdvancedPaths,
      protectedMainSha: repo.protectedMainSha,
      tracked: repo.tracked,
      writerLineCounts: repo.writerLineCounts,
      writerDeltas: repo.writerDeltas,
    })
  );
  const report = {
    schemaVersion: 1,
    sliceId: normalized.sliceId,
    tier: normalized.tier,
    repository: {
      root: repo.root,
      origin: repo.origin,
      providerRepository: repo.providerRepository,
      baseSha: repo.baseSha,
      capacityBaseSha: repo.capacityBaseSha,
      protectedMainSha: repo.protectedMainSha,
      mergeBaseSha: repo.mergeBaseSha,
      headSha: repo.headSha,
      treeSha: repo.treeSha,
      branch: repo.branch,
      committedChangedPaths: repo.committedChangedPaths,
      protectedMainAdvancedPaths: repo.protectedMainAdvancedPaths,
      dirtyPaths: repo.dirtyPaths,
      tracked: repo.tracked,
      capacityOwnerDeltas: repo.capacityOwnerDeltas,
      writerFactsDigest,
      writerMapDigest,
      operationFacts: operationResolution.facts,
    },
    writers: {
      paths: normalized.writerPaths,
      digest: writerMapDigest,
      plans: normalized.pathPlans,
      routineOperations: normalized.routineOperations,
    },
    capacity: {
      allocation: proposal.allocation,
      budgetArtifact: {
        content: proposal.budgetBytes,
        sha256: sha256(proposal.budgetBytes),
        utf8Bytes: Buffer.byteLength(proposal.budgetBytes),
      },
      selfBytesDelta: proposal.selfBytesDelta,
      maxTrackedBytes: proposal.budget.maxTrackedBytes,
      maxTrackedFiles: proposal.budget.maxTrackedFiles,
      maxCategoryBytes: proposal.budget.maxCategoryBytes,
    },
    modularity: {
      writerLineCounts: repo.writerLineCounts,
      plans: normalized.pathPlans.map(plan => ({
        path: plan.path,
        ...canonicalModularityForPath(plan.path),
      })),
    },
    topology: normalized.topology,
    evidence: {
      proof: normalized.proof,
      decisions: evidenceResult.decisions,
      reusableLanes: evidenceResult.reusableLanes,
      missingLanes: evidenceResult.missingLanes,
    },
    deficits: sorted(deficits),
    authorityStops: sorted(authorityStops),
    operationalEnvelope: null,
    reportSha256: null,
  };
  if (!report.authorityStops.length) report.operationalEnvelope = deriveOperationalEnvelope(report);
  report.reportSha256 = sha256(canonicalJson(report));
  return report;
}
