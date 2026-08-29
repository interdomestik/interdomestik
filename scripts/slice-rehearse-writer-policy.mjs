import { FILE_CLASSES, structuredArtifactOwner } from './modularity-guard-policy.mjs';
import { canonicalModularityForPath } from './slice-rehearse-core.mjs';

function stopWhenOver(stops, code, actual, limit) {
  if (actual > limit) stops.push({ code, actual, limit });
}

export function evaluateWriterPolicy(manifest, repository, budget) {
  const authorityStops = [];
  const deficits = [];
  for (const plan of manifest.pathPlans) {
    const modularity = canonicalModularityForPath(plan.path);
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
    if (Number.isInteger(modularity.maxBytes) && delta?.currentBytes > modularity.maxBytes) {
      deficits.push({
        code: `modularity:absolute-byte-cap:${plan.path}`,
        actual: delta.currentBytes,
        limit: modularity.maxBytes,
        coveredBy: 'extract_cohesive_helper',
      });
    }
    const plannedBytes =
      plan.change === 'create'
        ? plan.maxBytesDelta
        : (delta?.currentBytes ?? 0) + plan.maxBytesDelta;
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
    if (delta && (plan.change === 'create') === delta.manifestBaseExists) {
      authorityStops.push({ code: `repository:path-plan-mismatch:${plan.path}` });
    }
  }
  return { authorityStops, deficits };
}
