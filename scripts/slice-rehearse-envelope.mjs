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
const delta = (allocation, name, fallback = 0) =>
  allocation[`max${name}`] ?? allocation[name[0].toLowerCase() + name.slice(1)] ?? fallback;
const extras = value =>
  Object.fromEntries(
    'projectionOwners projectionPathCaps projectionHeadroom'
      .split(' ')
      .filter(key => value[key])
      .map(key => [key, value[key]])
  );

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
  const lifecycle = operations.find(item => item?.operation === 'compile_same_slice_delivery');
  const roles = lifecycle?.target.prRoles;
  const approval = lifecycle && {
    ...lifecycle,
    target: {
      ...lifecycle.target,
      prRoles: roles.map(({ baseSha: _base, headSha: _head, state: _state, ...role }) => role),
    },
  };
  const pulls = [
    ...Object.keys(resolution.facts?.pullRequests ?? {}),
    ...Object.values(resolution.facts?.pullRequestCandidates ?? {})
      .flat()
      .map(pull => String(pull.number)),
  ];
  const unique = new Set(pulls);
  if (lifecycle) {
    const declared = new Set(roles.map(role => String(role.number)));
    must(
      unique.size === declared.size && [...unique].every(number => declared.has(number)),
      'undeclared pull request'
    );
  } else must(unique.size <= 1, 'cannot derive envelope across multiple pull requests');
  for (const operation of requiredOperations) {
    must(operationNames.includes(operation), `deficit operation is outside envelope: ${operation}`);
  }
  const prNumber =
    Number(lifecycle ? roles.find(role => role.role === 'product').number : pulls[0]) || null;
  return {
    schemaVersion: 1,
    authorityGranted: false,
    sliceId: report.sliceId,
    tier: report.tier,
    baseSha: report.repository.baseSha,
    origin: report.repository.origin,
    branch: report.repository.branch,
    prNumber,
    writerMapDigest: report.writers.digest,
    writerClosure,
    outcomeRiskSha256: sha256(
      canonicalJson({
        plans: report.writers.plans,
        topology: report.topology,
        proof: report.evidence.proof,
        lifecycle: approval || null,
      })
    ),
    factsSha256: rehearsalFactsSha256(report),
    routineOperations: operations,
    requiredOperations,
    lifecycle: lifecycle ?? null,
    capacity: {
      allocationId: report.capacity.allocation.id,
      mode: report.capacity.allocation.mode,
      maxTrackedBytesDelta: delta(report.capacity.allocation, 'TrackedBytesDelta'),
      maxTrackedFilesDelta: delta(report.capacity.allocation, 'TrackedFilesDelta'),
      maxCategoryBytesDelta: delta(report.capacity.allocation, 'CategoryBytesDelta', {}),
      maxPathBytesDelta: delta(report.capacity.allocation, 'PathBytesDelta', {}),
      budgetArtifactSha256: requiredBudgetArtifactSha256(report, operationNames),
      ...extras(report.capacity),
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
    canonicalJson(
      Object.fromEntries(
        'baseSha capacityOwnerDeltas capacityBaseSha committedChangedPaths headSha mergeBaseSha protectedMainAdvancedPaths protectedMainSha tracked writerLineCounts writerDeltas'
          .split(' ')
          .map(key => [key, repo[key]])
      )
    )
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
      ...extras(proposal),
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
