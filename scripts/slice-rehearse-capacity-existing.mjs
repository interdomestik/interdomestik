import { compareText } from './slice-rehearse-canonical.mjs';
import { analyzeProjectionReuse } from './slice-rehearse-capacity-projection.mjs';
import { unchangedBudgetProposal } from './slice-rehearse-capacity-fixed-point.mjs';

export const BUDGET_PATH = 'scripts/repo-size-budget.json';
export const CAPACITY_REBASE_ID = 'capacity-rebase';

export function projectionBudgetProposal({
  budget,
  protectedBudgetText,
  manifest,
  baselineBudgetBytes,
  writerDeltas,
  capacityOwnerDeltas,
  allocationId,
  owners,
}) {
  const { authorityStops, ownerAllocations, plannedHeadroom, projectionPathCaps } =
    analyzeProjectionReuse({
      budget,
      manifest,
      writerDeltas,
      capacityOwnerDeltas,
      owners,
    });
  if (manifest.topology.repairPaths.length) {
    return {
      ...unchangedBudgetProposal({
        budget,
        budgetText: protectedBudgetText,
        baselineBudgetBytes,
        mode: 'blocked',
        authorityStops: [
          ...authorityStops,
          { code: 'capacity:governance-repair-pr-forbidden', paths: manifest.topology.repairPaths },
        ],
        allocation: {
          id: `${allocationId}-projection`,
          mode: 'projection-existing',
          writerPaths: [...manifest.writerPaths],
          ownerAllocations,
        },
      }),
      projectionOwners: ownerAllocations,
      projectionPathCaps,
      projectionHeadroom: plannedHeadroom,
    };
  }
  return {
    ...unchangedBudgetProposal({
      budget,
      budgetText: protectedBudgetText,
      baselineBudgetBytes,
      mode: 'projection-existing',
      authorityStops,
      allocation: {
        id: `${allocationId}-projection`,
        mode: 'projection-existing',
        writerPaths: [...manifest.writerPaths],
        ownerAllocations,
      },
    }),
    projectionHeadroom: plannedHeadroom,
    projectionOwners: ownerAllocations,
    projectionPathCaps,
  };
}

export function proposedAllocation(manifest, id, writerDeltas = {}) {
  const plans = manifest.pathPlans.filter(({ path }) => path !== BUDGET_PATH);
  if (!plans.length) return null;
  const maxCategoryBytesDelta = {};
  for (const { category, maxBytesDelta } of plans) {
    maxCategoryBytesDelta[category] = (maxCategoryBytesDelta[category] ?? 0) + maxBytesDelta;
  }
  return {
    id,
    mode: 'bounded',
    writerPaths: plans.map(plan => plan.path).sort(compareText),
    maxTrackedBytesDelta: plans.reduce((sum, { maxBytesDelta }) => sum + maxBytesDelta, 0),
    maxTrackedFilesDelta: plans.filter(plan => {
      const facts = writerDeltas[plan.path];
      const baselineExists = facts?.capacityBaselineExists ?? facts?.baselineExists;
      return baselineExists === undefined ? plan.change === 'create' : !baselineExists;
    }).length,
    maxCategoryBytesDelta,
    maxPathBytesDelta: Object.fromEntries(
      plans
        .map(({ path, maxBytesDelta }) => [path, maxBytesDelta])
        .sort(([left], [right]) => compareText(left, right))
    ),
  };
}

export function existingAllocationStops(owner, need, allocationId, subset = false) {
  const stops = [];
  if (owner.mode !== 'bounded') {
    stops.push({ code: 'capacity:existing-allocation-mode', allocationId });
    return stops;
  }
  const miss = need.writerPaths.some(path => !owner.writerPaths.includes(path));
  if (miss || (!subset && owner.writerPaths.length !== need.writerPaths.length))
    stops.push({ code: 'capacity:existing-writer-map-mismatch', allocationId });
  for (const [field, code] of [
    ['maxTrackedBytesDelta', 'capacity:existing-tracked-bytes-insufficient'],
    ['maxTrackedFilesDelta', 'capacity:existing-tracked-files-insufficient'],
  ]) {
    if (owner[field] < need[field]) {
      stops.push({ code, allocationId, actual: need[field], limit: owner[field] });
    }
  }
  for (const [path, bytes] of Object.entries(need.maxPathBytesDelta)) {
    if ((owner.maxPathBytesDelta[path] ?? -1) < bytes) {
      stops.push({
        code: 'capacity:existing-path-insufficient',
        path,
        actual: bytes,
        limit: owner.maxPathBytesDelta[path] ?? null,
      });
    }
  }
  for (const [category, bytes] of Object.entries(need.maxCategoryBytesDelta)) {
    if ((owner.maxCategoryBytesDelta[category] ?? 0) < bytes) {
      stops.push({
        code: 'capacity:existing-category-insufficient',
        category,
        actual: bytes,
        limit: owner.maxCategoryBytesDelta[category] ?? 0,
      });
    }
  }
  return stops;
}

function capacityStop(stops, code, actual, limit) {
  if (actual > limit) stops.push({ code, actual, limit });
}

export function appendCapacityEvaluation({ proposal, repo, deficits, authorityStops, categories }) {
  const capacityAlreadyApplied = proposal.worktreeBudget?.state === 'candidate-exact';
  if (proposal.mode === 'derived' && !capacityAlreadyApplied) {
    for (const [amount, code] of [
      [proposal.allocation.maxTrackedFilesDelta, 'capacity:new-files'],
      [proposal.allocation.maxTrackedBytesDelta, 'capacity:tracked-bytes'],
      [proposal.selfBytesDelta, 'capacity:budget-self-size'],
    ]) {
      if (amount) deficits.push({ code, amount, coveredBy: 'derived_capacity_rebind' });
    }
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
  for (const category of categories) {
    capacityStop(
      authorityStops,
      `capacity:global-category-bytes:${category}`,
      (repo.tracked.categoryBytes[category] ?? 0) +
        (proposal.projectionHeadroom?.categories[category] ?? 0),
      proposal.budget.maxCategoryBytes[category]
    );
  }
}
