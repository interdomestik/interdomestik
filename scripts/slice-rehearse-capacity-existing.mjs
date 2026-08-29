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
  deriveRepairProposal,
}) {
  const { authorityStops, ownerAllocations, plannedHeadroom } = analyzeProjectionReuse({
    budget,
    manifest,
    writerDeltas,
    capacityOwnerDeltas,
    owners,
  });
  if (manifest.topology.repairPaths.length) {
    const repairSet = new Set(manifest.topology.repairPaths);
    const repairProposal = deriveRepairProposal({
      budget,
      protectedBudgetText,
      baselineBudgetBytes,
      allocationIdOverride: manifest.topology.repairAllocationId,
      writerDeltas: Object.fromEntries(
        Object.entries(writerDeltas).filter(([filePath]) => repairSet.has(filePath))
      ),
      capacityOwnerDeltas: {},
      manifest: {
        ...manifest,
        writerPaths: [...manifest.topology.repairPaths],
        pathPlans: manifest.pathPlans.filter(plan => repairSet.has(plan.path)),
        topology: {
          closeoutMode: 'none',
          projectionPaths: [],
          repairAllocationId: null,
          repairPaths: [],
        },
      },
    });
    const stops = [...authorityStops, ...repairProposal.authorityStops];
    return {
      ...repairProposal,
      mode: stops.length ? 'blocked' : repairProposal.mode,
      authorityStops: stops,
      projectionOwners: ownerAllocations,
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
  };
}

export function proposedAllocation(manifest, id, writerDeltas = {}) {
  const plans = manifest.pathPlans.filter(plan => plan.path !== 'scripts/repo-size-budget.json');
  if (!plans.length) return null;
  const maxCategoryBytesDelta = {};
  for (const plan of plans) {
    maxCategoryBytesDelta[plan.category] =
      (maxCategoryBytesDelta[plan.category] ?? 0) + plan.maxBytesDelta;
  }
  return {
    id,
    mode: 'bounded',
    writerPaths: plans.map(plan => plan.path).sort(compareText),
    maxTrackedBytesDelta: plans.reduce((sum, plan) => sum + plan.maxBytesDelta, 0),
    maxTrackedFilesDelta: plans.filter(plan => {
      const facts = writerDeltas[plan.path];
      const baselineExists = facts?.capacityBaselineExists ?? facts?.baselineExists;
      return baselineExists === undefined ? plan.change === 'create' : !baselineExists;
    }).length,
    maxCategoryBytesDelta,
    maxPathBytesDelta: Object.fromEntries(
      plans
        .map(plan => [plan.path, plan.maxBytesDelta])
        .sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

export function existingAllocationStops(existing, allocation, allocationId) {
  const stops = [];
  if (existing.mode !== 'bounded') {
    stops.push({ code: 'capacity:existing-allocation-mode', allocationId });
    return stops;
  }
  if (
    JSON.stringify([...existing.writerPaths].sort(compareText)) !==
    JSON.stringify(allocation.writerPaths)
  ) {
    stops.push({ code: 'capacity:existing-writer-map-mismatch', allocationId });
  }
  for (const [field, code] of [
    ['maxTrackedBytesDelta', 'capacity:existing-tracked-bytes-insufficient'],
    ['maxTrackedFilesDelta', 'capacity:existing-tracked-files-insufficient'],
  ]) {
    if (existing[field] < allocation[field]) {
      stops.push({ code, allocationId, actual: allocation[field], limit: existing[field] });
    }
  }
  for (const [path, bytes] of Object.entries(allocation.maxPathBytesDelta)) {
    if ((existing.maxPathBytesDelta[path] ?? -1) < bytes) {
      stops.push({
        code: 'capacity:existing-path-insufficient',
        path,
        actual: bytes,
        limit: existing.maxPathBytesDelta[path] ?? null,
      });
    }
  }
  for (const [category, bytes] of Object.entries(allocation.maxCategoryBytesDelta)) {
    if ((existing.maxCategoryBytesDelta[category] ?? 0) < bytes) {
      stops.push({
        code: 'capacity:existing-category-insufficient',
        category,
        actual: bytes,
        limit: existing.maxCategoryBytesDelta[category] ?? 0,
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
