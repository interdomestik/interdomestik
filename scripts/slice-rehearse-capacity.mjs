import { validateCapacityBudget } from './repo-size-capacity-schema.mjs';
import {
  compareWorktreeBudget,
  unchangedBudgetProposal,
} from './slice-rehearse-capacity-existing.mjs';
import { analyzeProjectionReuse } from './slice-rehearse-capacity-projection.mjs';
import { deriveCapacityFixedPoint } from './slice-rehearse-capacity-fixed-point.mjs';

const BUDGET_PATH = 'scripts/repo-size-budget.json';
const CAPACITY_REBASE_ID = 'capacity-rebase';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function proposedAllocation(manifest, id, writerDeltas = {}) {
  const plans = manifest.pathPlans.filter(plan => plan.path !== BUDGET_PATH);
  if (!plans.length) return null;
  const maxCategoryBytesDelta = {};
  for (const plan of plans) {
    maxCategoryBytesDelta[plan.category] =
      (maxCategoryBytesDelta[plan.category] ?? 0) + plan.maxBytesDelta;
  }
  return {
    id,
    mode: 'bounded',
    writerPaths: plans.map(plan => plan.path).sort(),
    maxTrackedBytesDelta: plans.reduce((sum, plan) => sum + plan.maxBytesDelta, 0),
    maxTrackedFilesDelta: plans.filter(plan => {
      const facts = writerDeltas[plan.path];
      const capacityBaselineExists = facts?.capacityBaselineExists ?? facts?.baselineExists;
      return capacityBaselineExists === undefined
        ? plan.change === 'create'
        : !capacityBaselineExists;
    }).length,
    maxCategoryBytesDelta,
    maxPathBytesDelta: Object.fromEntries(
      plans
        .map(plan => [plan.path, plan.maxBytesDelta])
        .sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

function deriveProtectedProposal({
  budget,
  protectedBudgetText,
  manifest,
  baselineBudgetBytes,
  writerDeltas = {},
  capacityOwnerDeltas = {},
  allocationIdOverride = null,
}) {
  validateCapacityBudget(structuredClone(budget));
  must(
    Number.isSafeInteger(baselineBudgetBytes) && baselineBudgetBytes > 0,
    'baseline budget bytes must be a positive integer'
  );
  const allocationId = allocationIdOverride ?? manifest.sliceId.toLowerCase();
  const existing = budget.allocations.find(item => item.id === allocationId);
  const owners = new Map(
    budget.allocations.flatMap(allocation =>
      allocation.writerPaths.map(filePath => [filePath, allocation.id])
    )
  );
  if (manifest.topology.closeoutMode === 'projection-only') {
    const { authorityStops, ownerAllocations, plannedHeadroom } = analyzeProjectionReuse({
      budget,
      manifest,
      writerDeltas,
      capacityOwnerDeltas,
      owners,
    });
    if (manifest.topology.repairPaths.length) {
      const repairSet = new Set(manifest.topology.repairPaths);
      const repairProposal = deriveProtectedProposal({
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
  const authorityStops = [];
  for (const filePath of manifest.writerPaths) {
    const owner = owners.get(filePath);
    if (
      owner &&
      owner !== allocationId &&
      !(filePath === BUDGET_PATH && owner === CAPACITY_REBASE_ID)
    ) {
      authorityStops.push({
        code: 'capacity:writer-owner-overlap',
        path: filePath,
        owner,
        requestedOwner: allocationId,
      });
    }
  }

  const allocation = proposedAllocation(manifest, allocationId, writerDeltas);
  if (!allocation) {
    return unchangedBudgetProposal({
      budget,
      budgetText: protectedBudgetText,
      baselineBudgetBytes,
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:no-attributable-writers', allocationId }],
      allocation: { id: allocationId, mode: 'unavailable', writerPaths: [] },
    });
  }
  if (authorityStops.length) {
    return unchangedBudgetProposal({
      budget,
      budgetText: protectedBudgetText,
      baselineBudgetBytes,
      mode: 'blocked',
      authorityStops,
      allocation,
    });
  }
  if (existing) {
    if (existing.mode !== 'bounded') {
      authorityStops.push({ code: 'capacity:existing-allocation-mode', allocationId });
    } else {
      if (
        JSON.stringify([...existing.writerPaths].sort()) !== JSON.stringify(allocation.writerPaths)
      ) {
        authorityStops.push({ code: 'capacity:existing-writer-map-mismatch', allocationId });
      }
      if (existing.maxTrackedBytesDelta < allocation.maxTrackedBytesDelta) {
        authorityStops.push({
          code: 'capacity:existing-tracked-bytes-insufficient',
          allocationId,
          actual: allocation.maxTrackedBytesDelta,
          limit: existing.maxTrackedBytesDelta,
        });
      }
      if (existing.maxTrackedFilesDelta < allocation.maxTrackedFilesDelta) {
        authorityStops.push({
          code: 'capacity:existing-tracked-files-insufficient',
          allocationId,
          actual: allocation.maxTrackedFilesDelta,
          limit: existing.maxTrackedFilesDelta,
        });
      }
      for (const [path, bytes] of Object.entries(allocation.maxPathBytesDelta)) {
        if ((existing.maxPathBytesDelta[path] ?? -1) < bytes) {
          authorityStops.push({
            code: 'capacity:existing-path-insufficient',
            path,
            actual: bytes,
            limit: existing.maxPathBytesDelta[path] ?? null,
          });
        }
      }
      for (const [category, bytes] of Object.entries(allocation.maxCategoryBytesDelta)) {
        if ((existing.maxCategoryBytesDelta[category] ?? 0) < bytes) {
          authorityStops.push({
            code: 'capacity:existing-category-insufficient',
            category,
            actual: bytes,
            limit: existing.maxCategoryBytesDelta[category] ?? 0,
          });
        }
      }
    }
    return unchangedBudgetProposal({
      budget,
      budgetText: protectedBudgetText,
      baselineBudgetBytes,
      mode: 'existing',
      authorityStops,
      allocation: structuredClone(existing),
    });
  }
  if (!manifest.writerPaths.includes(BUDGET_PATH)) {
    return unchangedBudgetProposal({
      budget,
      budgetText: protectedBudgetText,
      baselineBudgetBytes,
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:new-allocation-missing-budget-writer' }],
      allocation,
    });
  }
  const rebase = budget.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  if (rebase?.mode !== 'exact' || !rebase.writerPaths.includes(BUDGET_PATH)) {
    return unchangedBudgetProposal({
      budget,
      budgetText: protectedBudgetText,
      baselineBudgetBytes,
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:rebase-allocation-unavailable' }],
      allocation,
    });
  }
  return deriveCapacityFixedPoint({ budget, allocation, baselineBudgetBytes });
}

export function deriveCapacityProposal({
  budget,
  budgetText,
  protectedBudget,
  protectedBudgetText,
  manifest,
  baselineBudgetBytes,
  writerDeltas = {},
  capacityOwnerDeltas = {},
}) {
  validateCapacityBudget(structuredClone(budget));
  validateCapacityBudget(structuredClone(protectedBudget));
  must(typeof budgetText === 'string' && budgetText.length > 0, 'worktree budget text is required');
  must(
    typeof protectedBudgetText === 'string' && protectedBudgetText.length > 0,
    'protected budget text is required'
  );
  const proposal = deriveProtectedProposal({
    budget: protectedBudget,
    protectedBudgetText,
    manifest,
    baselineBudgetBytes,
    writerDeltas,
    capacityOwnerDeltas,
  });
  return compareWorktreeBudget({
    worktreeBudget: budget,
    worktreeBudgetText: budgetText,
    protectedBudget,
    protectedBudgetText,
    proposal,
  });
}
