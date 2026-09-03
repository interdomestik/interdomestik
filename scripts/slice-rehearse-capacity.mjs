import { validateCapacityBudget } from './repo-size-capacity-schema.mjs';
import {
  BUDGET_PATH,
  CAPACITY_REBASE_ID,
  existingAllocationStops,
  projectionBudgetProposal,
  proposedAllocation,
} from './slice-rehearse-capacity-existing.mjs';
import {
  compareWorktreeBudget,
  deriveCapacityFixedPoint,
  unchangedBudgetProposal,
} from './slice-rehearse-capacity-fixed-point.mjs';
import { compareText, must, sha256 } from './slice-rehearse-canonical.mjs';

const CUTOVER_COMPANIONS = `apps/web/e2e/dashboard-access.spec.ts
apps/web/e2e/golden/agent-member-overlay.spec.ts
apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx
apps/web/src/components/dashboard/member-portal-runtime.tsx
apps/web/src/messages/en/dashboard.json
apps/web/src/messages/mk/dashboard.json
apps/web/src/messages/sq/dashboard.json
apps/web/src/messages/sr/dashboard.json`
  .split('\n')
  .sort(compareText);
const CUTOVER_SEED_DIGEST = '5fd52ee29a186994973103f09f60ea820c50c45c7c8540b2ebb4df71f963b2db';
const CUTOVER_PRODUCT_DIGEST = '9607ebda8ed38b016aefedaec045e22e6ab195b06371d2706ce0f3da9260bf36';
const CUTOVER_CLOSURE_DIGEST = '8c4bfe957679325dc3e81248fa8dce4bd1bdc7f6873be5c590f3dd0c8f7269b7';
const pathDigest = paths => sha256(JSON.stringify([...paths].sort(compareText)));
const companionCategory = path => {
  if (path.includes('/messages/')) return 'config/data/messages';
  return path.endsWith('.test.tsx') || path.includes('/e2e/') ? 'tests/e2e' : 'source/scripts';
};

export function compileWriterClosure(manifest) {
  if (manifest.sliceId !== 'T117B-CUTOVER') return { manifest, authorityStops: [] };
  const digest = pathDigest(manifest.writerPaths);
  if (digest === CUTOVER_CLOSURE_DIGEST) return { manifest, authorityStops: [] };
  if (![CUTOVER_SEED_DIGEST, CUTOVER_PRODUCT_DIGEST].includes(digest)) {
    return {
      manifest,
      authorityStops: [{ code: 'writer:unforeseen-cutover-closure', paths: manifest.writerPaths }],
    };
  }
  const additions = [...CUTOVER_COMPANIONS, BUDGET_PATH].filter(
    path => !manifest.writerPaths.includes(path)
  );
  const writerPaths = [...manifest.writerPaths, ...additions].sort(compareText);
  const pathPlans = additions
    .filter(path => path !== BUDGET_PATH)
    .map(path => ({
      path,
      change: 'modify',
      category: companionCategory(path),
      maxBytesDelta: path.includes('/messages/') ? 4_096 : 8_192,
      maxLines: 300,
    }));
  if (additions.includes(BUDGET_PATH)) {
    pathPlans.push({
      path: BUDGET_PATH,
      change: 'modify',
      category: 'config/data/messages',
      maxBytesDelta: 0,
      maxLines: 1_000,
    });
  }
  return {
    manifest: {
      ...manifest,
      writerPaths,
      pathPlans: [...manifest.pathPlans, ...pathPlans].sort((left, right) =>
        compareText(left.path, right.path)
      ),
      routineOperations: [...new Set([...manifest.routineOperations, 'derived_capacity_rebind'])],
    },
    authorityStops: [],
  };
}

export function extendBoundedAllocation(existing, proposed, categoriesByPath, writerDeltas = {}) {
  must(
    existing.mode === 'bounded' && proposed.mode === 'bounded' && existing.id === proposed.id,
    'one bounded identity required'
  );
  const result = structuredClone(existing);
  for (const path of proposed.writerPaths) {
    const previous = result.maxPathBytesDelta[path] ?? 0;
    const increase = Math.max(previous, proposed.maxPathBytesDelta[path]) - previous;
    result.maxPathBytesDelta[path] = previous + increase;
    result.maxTrackedBytesDelta += increase;
    const category = categoriesByPath[path];
    must(typeof category === 'string' && category.length > 0, `category missing: ${path}`);
    result.maxCategoryBytesDelta[category] =
      (result.maxCategoryBytesDelta[category] ?? 0) + increase;
    if (
      !existing.writerPaths.includes(path) &&
      writerDeltas[path]?.capacityBaselineExists === false
    )
      result.maxTrackedFilesDelta += 1;
  }
  result.writerPaths = [...new Set([...existing.writerPaths, ...proposed.writerPaths])].sort(
    compareText
  );
  result.maxPathBytesDelta = Object.fromEntries(
    Object.entries(result.maxPathBytesDelta).sort(([left], [right]) => compareText(left, right))
  );
  return result;
}

function deriveOwnerExtension({
  budget,
  existing,
  proposed,
  manifest,
  writerDeltas,
  baselineBudgetBytes,
}) {
  must(
    manifest.writerPaths.some(path => existing.writerPaths.includes(path)),
    'capacity owner extension requires an existing owned writer'
  );
  must(
    manifest.writerPaths.includes(BUDGET_PATH),
    'capacity owner extension requires the budget writer'
  );
  const categories = Object.fromEntries(manifest.pathPlans.map(plan => [plan.path, plan.category]));
  return deriveCapacityFixedPoint({
    budget,
    allocation: extendBoundedAllocation(existing, proposed, categories, writerDeltas),
    baselineBudgetBytes,
    replaceExisting: true,
  });
}

function deriveProtectedProposal({
  budget,
  protectedBudgetText: text,
  manifest,
  baselineBudgetBytes: bytes,
  writerDeltas: deltas = {},
  capacityOwnerDeltas: ownerDeltas = {},
}) {
  validateCapacityBudget(structuredClone(budget));
  must(Number.isSafeInteger(bytes) && bytes > 0, 'baseline bytes must be positive');
  const ownerId = manifest.capacityOwnerId ?? manifest.sliceId.toLowerCase();
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
