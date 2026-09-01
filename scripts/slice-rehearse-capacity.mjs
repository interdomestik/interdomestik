import { validateCapacityBudget } from './repo-size-capacity-schema.mjs';
import {
  BUDGET_PATH,
  CAPACITY_REBASE_ID,
  existingAllocationStops,
  projectionBudgetProposal,
  proposedAllocation,
} from './slice-rehearse-capacity-existing.mjs';
import { deriveOwnerExtension } from './slice-rehearse-capacity-extension.mjs';
import {
  compareWorktreeBudget,
  deriveCapacityFixedPoint,
  unchangedBudgetProposal,
} from './slice-rehearse-capacity-fixed-point.mjs';
import { must } from './slice-rehearse-canonical.mjs';

function deriveProtectedProposal({
  budget,
  protectedBudgetText: text,
  manifest,
  baselineBudgetBytes: bytes,
  writerDeltas: deltas = {},
  capacityOwnerDeltas: ownerDeltas = {},
  allocationIdOverride: override = null,
}) {
  validateCapacityBudget(structuredClone(budget));
  must(Number.isSafeInteger(bytes) && bytes > 0, 'baseline bytes must be positive');
  const ownerId = override ?? manifest.capacityOwnerId ?? manifest.sliceId.toLowerCase();
  const existing = budget.allocations.find(item => item.id === ownerId);
  const unchanged = fields =>
    unchangedBudgetProposal({
      budget,
      budgetText: text,
      baselineBudgetBytes: bytes,
      ...fields,
    });
  const owners = new Map(
    budget.allocations.flatMap(allocation =>
      allocation.writerPaths.map(filePath => [filePath, allocation.id])
    )
  );
  if (['projection-only', 'promotion'].includes(manifest.topology.closeoutMode)) {
    return projectionBudgetProposal({
      budget,
      protectedBudgetText: text,
      manifest,
      baselineBudgetBytes: bytes,
      writerDeltas: deltas,
      capacityOwnerDeltas: ownerDeltas,
      allocationId: ownerId,
      owners,
      deriveRepairProposal: deriveProtectedProposal,
    });
  }
  const stops = [];
  for (const filePath of manifest.writerPaths) {
    const owner = owners.get(filePath);
    if (owner && owner !== ownerId && !(filePath === BUDGET_PATH && owner === CAPACITY_REBASE_ID)) {
      stops.push({
        code: 'capacity:writer-owner-overlap',
        path: filePath,
        owner,
        requestedOwner: ownerId,
      });
    }
  }

  const cap = proposedAllocation(manifest, ownerId, deltas);
  if (!cap) {
    return unchanged({
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:no-attributable-writers', allocationId: ownerId }],
      allocation: { id: ownerId, mode: 'unavailable', writerPaths: [] },
    });
  }
  if (stops.length) {
    return unchanged({
      mode: 'blocked',
      authorityStops: stops,
      allocation: cap,
    });
  }
  const reuse = () => {
    if (
      manifest.schemaVersion === 2 &&
      manifest.workClass === 'governance' &&
      manifest.capacityOwnerId === ownerId
    ) {
      const gaps = existingAllocationStops(existing, cap, ownerId, true);
      if (!gaps.length) {
        return unchanged({
          mode: 'existing',
          authorityStops: [],
          allocation: structuredClone(existing),
        });
      }
      return deriveOwnerExtension({
        budget,
        existing,
        proposed: cap,
        manifest,
        writerDeltas: deltas,
        baselineBudgetBytes: bytes,
      });
    }
    stops.push(...existingAllocationStops(existing, cap, ownerId));
    return unchanged({
      mode: 'existing',
      authorityStops: stops,
      allocation: structuredClone(existing),
    });
  };
  if (existing) return reuse();
  if (!manifest.writerPaths.includes(BUDGET_PATH)) {
    return unchanged({
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:new-allocation-missing-budget-writer' }],
      allocation: cap,
    });
  }
  const rebase = budget.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  if (rebase?.mode !== 'exact' || !rebase.writerPaths.includes(BUDGET_PATH)) {
    return unchanged({
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:rebase-allocation-unavailable' }],
      allocation: cap,
    });
  }
  return deriveCapacityFixedPoint({ budget, allocation: cap, baselineBudgetBytes: bytes });
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
