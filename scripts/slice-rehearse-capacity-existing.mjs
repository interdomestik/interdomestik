import { createHash } from 'node:crypto';

const BUDGET_PATH = 'scripts/repo-size-budget.json';
const CAPACITY_REBASE_ID = 'capacity-rebase';

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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

export function unchangedBudgetProposal({
  budget,
  budgetText,
  baselineBudgetBytes,
  allocation,
  mode,
  authorityStops = [],
}) {
  const candidate = structuredClone(budget);
  const budgetBytes = budgetText ?? canonicalJson(candidate);
  const selfBytesDelta = Buffer.byteLength(budgetBytes) - baselineBudgetBytes;
  const exact = candidate.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  const stops = [...authorityStops];
  if (exact?.pathBytesDelta[BUDGET_PATH] !== selfBytesDelta) {
    stops.push({
      code: 'capacity:budget-self-size-stale',
      actual: exact?.pathBytesDelta[BUDGET_PATH] ?? null,
      required: selfBytesDelta,
    });
  }
  return {
    mode: stops.length ? 'blocked' : mode,
    allocation,
    budget: candidate,
    budgetBytes,
    sha256: createHash('sha256').update(budgetBytes).digest('hex'),
    selfBytesDelta,
    authorityStops: stops,
  };
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
  const state =
    worktreeBudgetBytes === proposal.budgetBytes
      ? 'candidate-exact'
      : worktreeBudgetBytes === protectedBudgetBytes
        ? 'protected-exact'
        : 'drift';
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
      actualSha256: createHash('sha256').update(worktreeBudgetBytes).digest('hex'),
      candidateSha256: proposal.sha256,
    });
  } else if (state === 'drift') {
    authorityStops.push({
      code: 'capacity:worktree-budget-drift',
      actualSha256: createHash('sha256').update(worktreeBudgetBytes).digest('hex'),
      candidateSha256: proposal.sha256,
      protectedSha256: createHash('sha256').update(protectedBudgetBytes).digest('hex'),
    });
  }
  return {
    ...proposal,
    mode:
      authorityStops.length > 0
        ? 'blocked'
        : state === 'candidate-exact' && proposal.mode === 'derived'
          ? 'existing'
          : proposal.mode,
    authorityStops,
    deficits,
    worktreeBudget: {
      state,
      sha256: createHash('sha256').update(worktreeBudgetBytes).digest('hex'),
    },
  };
}
