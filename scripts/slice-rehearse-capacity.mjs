import { validateCapacityBudget } from './repo-size-capacity-schema.mjs';
import {
  BUDGET_PATH,
  CAPACITY_REBASE_ID,
  existingAllocationStops,
  proposedAllocation,
  unchangedBudgetProposal,
} from './slice-rehearse-capacity-existing.mjs';
import { analyzeProjectionReuse } from './slice-rehearse-capacity-projection.mjs';
import {
  compareWorktreeBudget,
  deriveCapacityFixedPoint,
} from './slice-rehearse-capacity-fixed-point.mjs';
import { must } from './slice-rehearse-canonical.mjs';

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
    authorityStops.push(...existingAllocationStops(existing, allocation, allocationId));
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
