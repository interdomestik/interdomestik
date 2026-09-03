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
import {
  compareText,
  exactKeys,
  must,
  safeRelativePath,
  sha256,
  sortedUnique,
} from './slice-rehearse-canonical.mjs';

const HISTORY_LIMIT = 128;
const DIGEST = /^[0-9a-f]{64}$/u;
const pathDigest = paths => sha256(JSON.stringify([...paths].sort(compareText)));

export function normalizeWriterLineage(v, roles = []) {
  exactKeys(v, ['currentDigest', 'history', 'priorDigest'], 'lineage');
  must(DIGEST.test(v.priorDigest) && DIGEST.test(v.currentDigest), 'invalid digest');
  must(
    Array.isArray(v.history) && v.history.length > 1 && v.history.length <= HISTORY_LIMIT,
    'invalid history'
  );
  const byPr = new Map(roles.map(role => [role.number, role]));
  const seen = new Set();
  let parent = null;
  let prior = [];
  const history = v.history.map(item => {
    exactKeys(
      item,
      ['changedPathDigest', 'digest', 'parentDigest', 'prNumber', 'writerPaths'],
      'lineage node'
    );
    const paths = sortedUnique(item.writerPaths, 'lineage path', safeRelativePath);
    const role = byPr.get(item.prNumber);
    must(
      paths.length &&
        item.digest === pathDigest(paths) &&
        item.changedPathDigest === role?.changedPathDigest &&
        item.parentDigest === parent &&
        paths.length > prior.length &&
        prior.every(path => paths.includes(path)) &&
        !seen.has(item.prNumber) &&
        !seen.has(item.digest),
      'invalid lineage node'
    );
    seen.add(item.prNumber).add(item.digest);
    parent = item.digest;
    prior = paths;
    return { ...item, writerPaths: paths };
  });
  must(
    v.priorDigest !== v.currentDigest &&
      history[0].digest === v.priorDigest &&
      history.at(-1).digest === v.currentDigest,
    'invalid lineage endpoints'
  );
  return { ...v, history };
}

// prettier-ignore
function compilesSameSliceGovernance(m) {
  const d = m.routineOperations.filter(v => v?.operation === 'compile_same_slice_delivery');
  return m.schemaVersion === 2 && m.workClass === 'governance' && m.capacityOwnerId === m.sliceId.toLowerCase() && m.topology.closeoutMode === 'none' && d.length === 1 && d[0].target.taskId === m.sliceId;
}

export function compileWriterClosure(manifest) {
  const stop = code => ({ manifest, authorityStops: code ? [{ code }] : [] });
  const op = manifest.routineOperations.find(
    item => item?.operation === 'compile_same_slice_delivery'
  );
  if (!op)
    return stop(manifest.sliceId === 'T117B-CUTOVER' ? 'writer:undeclared-cutover-lineage' : null);
  let lineage;
  try {
    lineage = normalizeWriterLineage(op.target.writerLineage, op.target.prRoles);
  } catch {
    return stop('writer:invalid-declared-lineage');
  }
  if (pathDigest(manifest.writerPaths) !== lineage.currentDigest)
    return stop('writer:declared-current-digest-mismatch');
  const { currentDigest, history, priorDigest } = lineage;
  return {
    manifest,
    authorityStops: [],
    writerLineage: {
      priorDigest,
      currentDigest,
      ancestry: history.map(node => node.digest).reverse(),
    },
  };
}

export function extendBoundedAllocation(existing, proposed, categories, deltas = {}) {
  must(
    existing.mode === 'bounded' && proposed.mode === 'bounded' && existing.id === proposed.id,
    'one bounded identity required'
  );
  const next = structuredClone(existing);
  for (const path of proposed.writerPaths) {
    const prior = next.maxPathBytesDelta[path] ?? 0;
    const added = Math.max(prior, proposed.maxPathBytesDelta[path]) - prior;
    next.maxPathBytesDelta[path] = prior + added;
    next.maxTrackedBytesDelta += added;
    const kind = categories[path];
    must(typeof kind === 'string' && kind.length > 0, `category missing: ${path}`);
    next.maxCategoryBytesDelta[kind] = (next.maxCategoryBytesDelta[kind] ?? 0) + added;
    if (!existing.writerPaths.includes(path) && deltas[path]?.capacityBaselineExists === false)
      next.maxTrackedFilesDelta += 1;
  }
  next.writerPaths = [...new Set([...existing.writerPaths, ...proposed.writerPaths])].sort(
    compareText
  );
  next.maxPathBytesDelta = Object.fromEntries(
    Object.entries(next.maxPathBytesDelta).sort(([left], [right]) => compareText(left, right))
  );
  return next;
}

function extendOwner(budget, existing, proposed, manifest, deltas, bytes) {
  must(
    manifest.writerPaths.some(path => existing.writerPaths.includes(path)),
    'capacity owner extension requires an existing owned writer'
  );
  must(
    manifest.writerPaths.includes(BUDGET_PATH) || compilesSameSliceGovernance(manifest),
    'capacity owner extension requires the budget writer'
  );
  const categories = Object.fromEntries(manifest.pathPlans.map(plan => [plan.path, plan.category]));
  return deriveCapacityFixedPoint({
    budget,
    allocation: extendBoundedAllocation(existing, proposed, categories, deltas),
    baselineBudgetBytes: bytes,
    replaceExisting: true,
  });
}

function protectedProposal(budget, text, manifest, bytes, deltas = {}, ownerDeltas = {}) {
  validateCapacityBudget(structuredClone(budget));
  must(Number.isSafeInteger(bytes) && bytes > 0, 'baseline bytes must be positive');
  const id = manifest.capacityOwnerId ?? manifest.sliceId.toLowerCase();
  const existing = budget.allocations.find(item => item.id === id);
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
      allocationId: id,
      owners,
    });
  }
  const stops = [];
  for (const path of manifest.writerPaths) {
    const owner = owners.get(path);
    if (owner && owner !== id && !(path === BUDGET_PATH && owner === CAPACITY_REBASE_ID)) {
      stops.push({
        code: 'capacity:writer-owner-overlap',
        path,
        owner,
        requestedOwner: id,
      });
    }
  }

  const cap = proposedAllocation(manifest, id, deltas);
  if (!cap) {
    return unchanged({
      mode: 'blocked',
      authorityStops: [{ code: 'capacity:no-attributable-writers', allocationId: id }],
      allocation: { id, mode: 'unavailable', writerPaths: [] },
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
      manifest.capacityOwnerId === id
    ) {
      const gaps = existingAllocationStops(existing, cap, id, true);
      if (!gaps.length) {
        return unchanged({
          mode: 'existing',
          authorityStops: [],
          allocation: structuredClone(existing),
        });
      }
      return extendOwner(budget, existing, cap, manifest, deltas, bytes);
    }
    stops.push(...existingAllocationStops(existing, cap, id));
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
  const proposal = protectedProposal(
    protectedBudget,
    protectedBudgetText,
    manifest,
    baselineBudgetBytes,
    writerDeltas,
    capacityOwnerDeltas
  );
  return compareWorktreeBudget({
    worktreeBudget: budget,
    worktreeBudgetText: budgetText,
    protectedBudget,
    protectedBudgetText,
    proposal,
  });
}
