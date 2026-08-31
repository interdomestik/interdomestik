import {
  classifyModularityFile,
  FILE_CLASSES,
  MODULARITY_POLICY,
  structuredArtifactOwner,
} from './modularity-guard-policy.mjs';
import { canonicalJson, normalizeGitHubOrigin, sortedText } from './slice-rehearse-canonical.mjs';

const CANONICAL_PROVIDER_REPOSITORY = 'interdomestik/interdomestik';
const IDENTITY_CHANGING_OPERATIONS = new Set([
  'add_focused_test',
  'bounded_force_with_lease_rebuild',
  'derived_capacity_rebind',
  'extract_cohesive_helper',
  'fresh_worktree_patch_replay',
  'sequence_prerequisite_before_projection',
  'split_focused_test',
]);

export function canonicalModularityForPath(path) {
  const fileClass = classifyModularityFile(path);
  if (fileClass === FILE_CLASSES.productionCode) {
    return {
      fileClass,
      maxLines: MODULARITY_POLICY.productionCode.reviewLines,
    };
  }
  if (fileClass === FILE_CLASSES.focusedTest) {
    return { fileClass, maxLines: MODULARITY_POLICY.focusedTest.maxLines };
  }
  if (fileClass === FILE_CLASSES.governanceDoc) {
    return {
      fileClass,
      maxLines: MODULARITY_POLICY.governanceDoc.maxLines,
      maxBytes: MODULARITY_POLICY.governanceDoc.maxBytes,
    };
  }
  if (fileClass === FILE_CLASSES.structuredArtifact) {
    return { fileClass, maxBytes: MODULARITY_POLICY.structuredArtifact.maxBytes };
  }
  return { fileClass, maxLines: null, maxBytes: null };
}

function stopWhenOver(stops, code, actual, limit) {
  if (actual > limit) stops.push({ code, actual, limit });
}

function evaluateWriterPlan(plan, repository, budget, authorityStops, deficits) {
  const modularity = canonicalModularityForPath(plan.path, plan.change);
  const actualLines = repository.writerLineCounts[plan.path] ?? 0;
  const delta = repository.writerDeltas[plan.path];
  if (Number.isInteger(modularity.maxLines) && actualLines > plan.maxLines) {
    deficits.push({
      code: `modularity:line-cap:${plan.path}`,
      actual: actualLines,
      limit: plan.maxLines,
      canonicalLimit: modularity.maxLines,
      coveredBy:
        modularity.fileClass === FILE_CLASSES.focusedTest
          ? 'split_focused_test'
          : 'extract_cohesive_helper',
    });
  }
  if (
    modularity.fileClass === FILE_CLASSES.structuredArtifact &&
    structuredArtifactOwner(plan.path) === null
  ) {
    authorityStops.push({ code: `modularity:structured-owner-missing:${plan.path}` });
  }
  const plannedBytes =
    plan.change === 'create'
      ? plan.maxBytesDelta
      : Math.max(delta?.currentBytes ?? 0, (delta?.baseBytes ?? 0) + plan.maxBytesDelta);
  if (
    Number.isInteger(modularity.maxBytes) &&
    Math.max(delta?.currentBytes ?? 0, plannedBytes) > modularity.maxBytes
  ) {
    deficits.push({
      code: `modularity:absolute-byte-cap:${plan.path}`,
      actual: Math.max(delta?.currentBytes ?? 0, plannedBytes),
      limit: modularity.maxBytes,
      coveredBy: 'extract_cohesive_helper',
    });
  }
  stopWhenOver(
    authorityStops,
    `capacity:largest-file-current:${plan.path}`,
    delta?.currentBytes ?? 0,
    budget.maxLargestFileBytes
  );
  stopWhenOver(
    authorityStops,
    `capacity:largest-file-planned:${plan.path}`,
    plannedBytes,
    budget.maxLargestFileBytes
  );
  if ([FILE_CLASSES.productionCode, FILE_CLASSES.focusedTest].includes(modularity.fileClass)) {
    stopWhenOver(
      authorityStops,
      `capacity:source-or-test-lines-current:${plan.path}`,
      actualLines,
      budget.maxSourceOrTestLines
    );
    stopWhenOver(
      authorityStops,
      `capacity:source-or-test-lines-planned:${plan.path}`,
      plan.maxLines,
      budget.maxSourceOrTestLines
    );
  }
  if (plan.path !== 'scripts/repo-size-budget.json' && delta?.bytes > plan.maxBytesDelta) {
    authorityStops.push({
      code: `capacity:path-cap-drift:${plan.path}`,
      actual: delta.bytes,
      limit: plan.maxBytesDelta,
    });
  }
  if ((plan.change === 'create') === delta?.manifestBaseExists) {
    authorityStops.push({ code: `repository:path-plan-mismatch:${plan.path}` });
  }
}

export function evaluateWriterPolicy(manifest, repository, budget) {
  const authorityStops = [];
  const deficits = [];
  for (const plan of manifest.pathPlans) {
    evaluateWriterPlan(plan, repository, budget, authorityStops, deficits);
  }
  return { authorityStops, deficits };
}

export function repositoryAuthorityStops(manifest, repository) {
  const stops = [];
  const manifestIdentity = normalizeGitHubOrigin(manifest.origin);
  const outsideDirty = repository.dirtyPaths.filter(path => !manifest.writerPaths.includes(path));
  const outsideCommitted = repository.committedChangedPaths.filter(
    path => !manifest.writerPaths.includes(path)
  );
  if (outsideDirty.length)
    stops.push({ code: 'repository:outside-writer-dirty', paths: outsideDirty });
  if (outsideCommitted.length) {
    stops.push({ code: 'repository:outside-writer-committed', paths: outsideCommitted });
  }
  if (repository.origin !== manifestIdentity.origin)
    stops.push({ code: 'repository:origin-mismatch' });
  if (
    repository.providerRepository !== CANONICAL_PROVIDER_REPOSITORY ||
    manifestIdentity.providerRepository !== CANONICAL_PROVIDER_REPOSITORY
  ) {
    stops.push({ code: 'repository:provider-repository-mismatch' });
  }
  if (repository.baseSha !== manifest.baseSha || !repository.baseIsAncestor) {
    stops.push({ code: 'repository:base-identity-mismatch' });
  }
  const overlap = repository.protectedMainAdvancedPaths.filter(path =>
    manifest.writerPaths.includes(path)
  );
  if (overlap.length)
    stops.push({ code: 'repository:protected-main-writer-overlap', paths: overlap });
  const expectedPaths = canonicalJson(manifest.writerPaths);
  if (
    canonicalJson(sortedText(Object.keys(repository.writerDeltas))) !== expectedPaths ||
    canonicalJson(sortedText(Object.keys(repository.writerLineCounts))) !== expectedPaths
  ) {
    stops.push({ code: 'repository:writer-facts-incomplete' });
  }
  for (const plan of manifest.pathPlans) {
    if (plan.change === 'modify' && repository.writerDeltas[plan.path]?.currentExists === false) {
      stops.push({ code: `repository:writer-missing:${plan.path}` });
    }
  }
  return stops;
}

export function evidenceAfterPlannedOperations(evidence, deficits) {
  const planned = new Set(deficits.map(deficit => deficit.coveredBy).filter(Boolean));
  const invalidated = [...planned].some(operation => IDENTITY_CHANGING_OPERATIONS.has(operation));
  if (!invalidated) return evidence;
  return {
    ...evidence,
    decisions: evidence.decisions.map(decision =>
      decision.reusable
        ? { ...decision, reusable: false, reason: 'invalidated_by_planned_operation' }
        : decision
    ),
    reusableLanes: [],
    missingLanes: sortedText(new Set([...evidence.missingLanes, ...evidence.reusableLanes])),
  };
}

export function requiredEvidenceProofDeficit(evidence) {
  if (!evidence.missingLanes.length) return null;
  return {
    code: 'evidence:heavy-proof-required',
    lanes: evidence.missingLanes,
    coveredBy: 'rerun_invalidated_proof',
  };
}
