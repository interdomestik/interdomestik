import { canonicalJson, compareText, sha256 } from './slice-rehearse-canonical.mjs';
import {
  requiredBudgetArtifactSha256,
  resolveOperationalContracts,
  routineOperationName,
} from './slice-rehearse-operation-contracts.mjs';
import { canonicalModularityForPath } from './slice-rehearse-writer-policy.mjs';

const STOP_CLASSES = Object.freeze([
  'evidence_identity_drift',
  'non_linear_history',
  'product_scope',
  'provider_effect',
  'security_or_privacy',
  'successor_scope',
  'trust_boundary',
  'unknown_writer',
]);

function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function rehearsalFactsSha256(report) {
  const repository = report.repository
    ? Object.fromEntries(Object.entries(report.repository).filter(([key]) => key !== 'root'))
    : report.repository;
  return sha256(
    canonicalJson({
      ...report,
      repository,
      operationalEnvelope: null,
      reportSha256: null,
    })
  );
}

export function deriveOperationalEnvelope(report) {
  must(report && typeof report === 'object', 'rehearsal report is required');
  must(Array.isArray(report.authorityStops), 'rehearsal authority stops are invalid');
  must(!report.authorityStops.length, 'cannot derive envelope with an authority stop');
  const requiredOperations = [
    ...new Set(report.deficits.map(item => item.coveredBy).filter(Boolean)),
  ].sort(compareText);
  const resolution = resolveOperationalContracts(
    report.writers.routineOperations,
    report.repository
  );
  must(!resolution.rejected.length, 'cannot derive envelope with an unverified operation');
  const operations = resolution.granted;
  const operationNames = operations.map(routineOperationName);
  const writerClosure = [...(report.writers.paths ?? [])].sort(compareText);
  const pullNumbers = [
    ...Object.keys(resolution.facts?.pullRequests ?? {}),
    ...Object.values(resolution.facts?.pullRequestCandidates ?? {})
      .flat()
      .map(pull => String(pull.number)),
  ];
  must(new Set(pullNumbers).size <= 1, 'cannot derive envelope across multiple pull requests');
  for (const operation of requiredOperations) {
    must(operationNames.includes(operation), `deficit operation is outside envelope: ${operation}`);
  }
  return {
    schemaVersion: 1,
    authorityGranted: false,
    sliceId: report.sliceId,
    tier: report.tier,
    baseSha: report.repository.baseSha,
    origin: report.repository.origin,
    branch: report.repository.branch,
    prNumber: pullNumbers.length ? Number(pullNumbers[0]) : null,
    writerMapDigest: report.writers.digest,
    writerClosure,
    outcomeRiskSha256: sha256(
      canonicalJson({
        plans: report.writers.plans,
        topology: report.topology,
        proof: report.evidence.proof,
      })
    ),
    factsSha256: rehearsalFactsSha256(report),
    routineOperations: operations,
    requiredOperations,
    capacity: {
      allocationId: report.capacity.allocation.id,
      mode: report.capacity.allocation.mode,
      maxTrackedBytesDelta:
        report.capacity.allocation.maxTrackedBytesDelta ??
        report.capacity.allocation.trackedBytesDelta ??
        0,
      maxTrackedFilesDelta:
        report.capacity.allocation.maxTrackedFilesDelta ??
        report.capacity.allocation.trackedFilesDelta ??
        0,
      maxCategoryBytesDelta:
        report.capacity.allocation.maxCategoryBytesDelta ??
        report.capacity.allocation.categoryBytesDelta ??
        {},
      maxPathBytesDelta:
        report.capacity.allocation.maxPathBytesDelta ??
        report.capacity.allocation.pathBytesDelta ??
        {},
      budgetArtifactSha256: requiredBudgetArtifactSha256(report, operationNames),
      ...(report.capacity.projectionOwners
        ? { projectionOwners: report.capacity.projectionOwners }
        : {}),
      ...(report.capacity.projectionPathCaps
        ? { projectionPathCaps: report.capacity.projectionPathCaps }
        : {}),
      ...(report.capacity.projectionHeadroom
        ? { projectionHeadroom: report.capacity.projectionHeadroom }
        : {}),
    },
    proof: report.evidence.proof,
    stopClasses: [...STOP_CLASSES],
  };
}

export function buildRehearsalReport({
  normalized,
  repo,
  proposal,
  operationResolution,
  evidenceResult,
  proofPlan,
  deficits,
  authorityStops,
  writerMapDigest,
}) {
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
      ...(proposal.projectionOwners ? { projectionOwners: proposal.projectionOwners } : {}),
      ...(proposal.projectionPathCaps ? { projectionPathCaps: proposal.projectionPathCaps } : {}),
      ...(proposal.projectionHeadroom ? { projectionHeadroom: proposal.projectionHeadroom } : {}),
    },
    modularity: {
      writerLineCounts: repo.writerLineCounts,
      plans: normalized.pathPlans.map(plan => ({
        path: plan.path,
        ...canonicalModularityForPath(plan.path, plan.change),
      })),
    },
    topology: normalized.topology,
    evidence: {
      proof: normalized.proof,
      decisions: evidenceResult.decisions,
      executionPlan: proofPlan,
      reusableLanes: evidenceResult.reusableLanes,
      missingLanes: evidenceResult.missingLanes,
    },
    deficits,
    authorityStops,
    operationalEnvelope: null,
    reportSha256: null,
  };
  if (!report.authorityStops.length) report.operationalEnvelope = deriveOperationalEnvelope(report);
  report.reportSha256 = sha256(canonicalJson(report));
  return report;
}
