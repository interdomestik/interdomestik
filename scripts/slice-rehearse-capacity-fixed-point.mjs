import {
  allocationDelta,
  CAPACITY_CATEGORIES,
  categoryAllocationDelta,
  validateCapacityBudget,
} from './repo-size-capacity-schema.mjs';
import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';

const BUDGET_PATH = 'scripts/repo-size-budget.json';
const CAPACITY_REBASE_ID = 'capacity-rebase';

function deriveCeilings(value) {
  const total = key =>
    value.allocations.reduce((sum, allocation) => sum + allocationDelta(allocation, key), 0);
  value.maxTrackedBytes =
    value.baseline.trackedBytes + value.reserve.trackedBytes + total('trackedBytesDelta');
  value.maxTrackedFiles =
    value.baseline.trackedFiles + value.reserve.trackedFiles + total('trackedFilesDelta');
  value.maxCategoryBytes = Object.fromEntries(
    CAPACITY_CATEGORIES.map(category => [
      category,
      value.baseline.categoryBytes[category] +
        (value.reserve.categoryBytes[category] ?? 0) +
        value.allocations.reduce(
          (sum, allocation) => sum + categoryAllocationDelta(allocation, category),
          0
        ),
    ])
  );
}

function updateBudgetSelfSize(value, delta) {
  const allocation = value.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  if (allocation?.mode !== 'exact' || !allocation.writerPaths.includes(BUDGET_PATH)) {
    throw new Error('capacity-rebase exact budget-path allocation is required');
  }
  const previous = allocation.pathBytesDelta[BUDGET_PATH];
  const adjustment = delta - previous;
  allocation.pathBytesDelta[BUDGET_PATH] = delta;
  allocation.trackedBytesDelta += adjustment;
  allocation.categoryBytesDelta['config/data/messages'] += adjustment;
}

function candidateAt(budget, allocation, selfBytesDelta) {
  const candidate = structuredClone(budget);
  updateBudgetSelfSize(candidate, selfBytesDelta);
  candidate.allocations.push(structuredClone(allocation));
  deriveCeilings(candidate);
  validateCapacityBudget(candidate);
  const budgetBytes = `${JSON.stringify(candidate, null, 2)}\n`;
  return { candidate, budgetBytes };
}

function result(candidate, budgetBytes, selfBytesDelta, authorityStops = []) {
  return {
    mode: authorityStops.length ? 'blocked' : 'derived',
    allocation: candidate.allocations.at(-1),
    budget: candidate,
    budgetBytes,
    sha256: sha256(budgetBytes),
    selfBytesDelta,
    authorityStops,
  };
}

function withoutDerivedFields(value, allocationId) {
  const normalized = structuredClone(value);
  normalized.allocations = normalized.allocations
    .filter(allocation => allocation.id !== allocationId)
    .map(allocation => {
      if (allocation.id !== CAPACITY_REBASE_ID || allocation.mode !== 'exact') return allocation;
      const budgetBytes = allocation.pathBytesDelta[BUDGET_PATH];
      allocation.pathBytesDelta[BUDGET_PATH] = 0;
      allocation.trackedBytesDelta -= budgetBytes;
      allocation.categoryBytesDelta['config/data/messages'] -= budgetBytes;
      return allocation;
    });
  normalized.maxTrackedBytes = 0;
  normalized.maxTrackedFiles = 0;
  normalized.maxCategoryBytes = {};
  return normalized;
}

function budgetState(worktreeBytes, protectedBytes, candidateBytes) {
  if (worktreeBytes === candidateBytes) return 'candidate-exact';
  if (worktreeBytes === protectedBytes) return 'protected-exact';
  return 'drift';
}

export function compareWorktreeBudget({
  worktreeBudget,
  worktreeBudgetText,
  protectedBudget,
  protectedBudgetText,
  proposal,
}) {
  const worktreeBudgetBytes = worktreeBudgetText ?? canonicalJson(worktreeBudget);
  const protectedBudgetBytes = protectedBudgetText ?? canonicalJson(protectedBudget);
  const state = budgetState(worktreeBudgetBytes, protectedBudgetBytes, proposal.budgetBytes);
  const authorityStops = [...proposal.authorityStops];
  const deficits = [...(proposal.deficits ?? [])];
  const derivedRebind =
    state === 'drift' &&
    proposal.mode === 'derived' &&
    canonicalJson(withoutDerivedFields(worktreeBudget, proposal.allocation.id)) ===
      canonicalJson(withoutDerivedFields(protectedBudget, proposal.allocation.id));
  if (derivedRebind) {
    deficits.push({
      code: 'capacity:worktree-budget-rebind',
      coveredBy: 'derived_capacity_rebind',
      actualSha256: sha256(worktreeBudgetBytes),
      candidateSha256: proposal.sha256,
    });
  } else if (state === 'drift') {
    authorityStops.push({
      code: 'capacity:worktree-budget-drift',
      actualSha256: sha256(worktreeBudgetBytes),
      candidateSha256: proposal.sha256,
      protectedSha256: sha256(protectedBudgetBytes),
    });
  }
  let mode = proposal.mode;
  if (authorityStops.length > 0) mode = 'blocked';
  else if (state === 'candidate-exact' && proposal.mode === 'derived') mode = 'existing';
  return {
    ...proposal,
    mode,
    authorityStops,
    deficits,
    worktreeBudget: { state, sha256: sha256(worktreeBudgetBytes) },
  };
}

export function deriveCapacityFixedPoint({ budget, allocation, baselineBudgetBytes }) {
  const original = budget.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  let selfBytesDelta = original.pathBytesDelta[BUDGET_PATH];
  const observed = new Set();
  for (let iteration = 1; iteration <= 64; iteration += 1) {
    observed.add(selfBytesDelta);
    const { candidate, budgetBytes } = candidateAt(budget, allocation, selfBytesDelta);
    const nextDelta = Buffer.byteLength(budgetBytes) - baselineBudgetBytes;
    if (nextDelta < 0) throw new Error('derived budget self-size is negative');
    if (nextDelta === selfBytesDelta) return result(candidate, budgetBytes, selfBytesDelta);
    if (observed.has(nextDelta)) break;
    observed.add(nextDelta);
    selfBytesDelta = nextDelta;
  }
  let upperBound = Math.max(...observed);
  let upper = candidateAt(budget, allocation, upperBound);
  let observedDelta = Buffer.byteLength(upper.budgetBytes) - baselineBudgetBytes;
  for (let iteration = 0; observedDelta > upperBound && iteration < 64; iteration += 1) {
    upperBound = observedDelta;
    upper = candidateAt(budget, allocation, upperBound);
    observedDelta = Buffer.byteLength(upper.budgetBytes) - baselineBudgetBytes;
  }
  return result(upper.candidate, upper.budgetBytes, upperBound, [
    {
      code: 'capacity:fixed-point-upper-bound',
      upperBound,
      observedDelta,
      coveredBy: 'derived_capacity_rebind',
    },
  ]);
}
