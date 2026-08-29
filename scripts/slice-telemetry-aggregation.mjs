const GOVERNANCE_PHASES = new Set(['rehearsal', 'approval', 'closeout']);
const OPERATIONAL_BLOCKER_PHASES = new Set([
  'capacity',
  'implementation',
  'runner',
  'merge',
  'closeout',
  'provider',
]);
const INTEGER_KEYS = [
  'elapsedMs',
  'waitMs',
  'computeMs',
  'approvals',
  'reFreezes',
  'retries',
  'governanceElapsedMs',
  'reviewElapsedMs',
];

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedNumber(value) {
  return Number(value.toFixed(12));
}

export function checkedIntegerSum(left, right, label) {
  const result = left + right;
  must(Number.isSafeInteger(result) && result >= 0, `${label} aggregation overflowed`);
  return result;
}

function checkedFiniteSum(left, right, label) {
  const result = left + right;
  must(Number.isFinite(result) && result >= 0, `${label} aggregation overflowed`);
  return normalizedNumber(result);
}

export function emptyTelemetrySlice(sliceId) {
  return {
    sliceId,
    elapsedMs: 0,
    waitMs: 0,
    computeMs: 0,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    runnerMinutes: 0,
    modelCostUsd: 0,
    modelCostComplete: true,
    governanceElapsedMs: 0,
    reviewElapsedMs: 0,
    operationalApprovals: 0,
    operationalMicroApprovals: 0,
    blockerDistribution: {},
    evidenceKeys: [],
  };
}

export function addTelemetryEvent(summary, event) {
  for (const key of INTEGER_KEYS.slice(0, 6)) {
    summary[key] = checkedIntegerSum(summary[key], event[key], key);
  }
  summary.runnerMinutes = checkedFiniteSum(
    summary.runnerMinutes,
    event.runnerMinutes,
    'runner minutes'
  );
  if (event.modelCostUsd === null) summary.modelCostComplete = false;
  else {
    summary.modelCostUsd = checkedFiniteSum(summary.modelCostUsd, event.modelCostUsd, 'model cost');
  }
  if (GOVERNANCE_PHASES.has(event.phase)) {
    summary.governanceElapsedMs = checkedIntegerSum(
      summary.governanceElapsedMs,
      event.elapsedMs,
      'governance elapsed milliseconds'
    );
  }
  if (event.phase === 'review') {
    summary.reviewElapsedMs = checkedIntegerSum(
      summary.reviewElapsedMs,
      event.elapsedMs,
      'review elapsed milliseconds'
    );
  }
  if (OPERATIONAL_BLOCKER_PHASES.has(event.blockerPhase)) {
    summary.operationalApprovals = checkedIntegerSum(
      summary.operationalApprovals,
      event.approvals,
      'operational approvals'
    );
  }
  if (event.blockerPhase !== 'none') {
    summary.blockerDistribution[event.blockerPhase] = checkedIntegerSum(
      summary.blockerDistribution[event.blockerPhase] ?? 0,
      1,
      'blocker count'
    );
  }
  if (event.evidenceKey !== null && !summary.evidenceKeys.includes(event.evidenceKey)) {
    summary.evidenceKeys.push(event.evidenceKey);
    summary.evidenceKeys.sort(compareText);
  }
}

export function aggregateTelemetryTotals(slices) {
  const totals = Object.fromEntries(INTEGER_KEYS.map(key => [key, 0]));
  totals.runnerMinutes = 0;
  const modelCostComplete = slices.every(slice => slice.modelCostUsd !== null);
  totals.modelCostUsd = modelCostComplete ? 0 : null;
  const blockerDistribution = {};
  for (const slice of slices) {
    for (const key of INTEGER_KEYS) {
      totals[key] = checkedIntegerSum(totals[key], slice[key], key);
    }
    totals.runnerMinutes = checkedFiniteSum(
      totals.runnerMinutes,
      slice.runnerMinutes,
      'runner minutes'
    );
    if (modelCostComplete) {
      totals.modelCostUsd = checkedFiniteSum(totals.modelCostUsd, slice.modelCostUsd, 'model cost');
    }
    for (const [phase, count] of Object.entries(slice.blockerDistribution)) {
      blockerDistribution[phase] = checkedIntegerSum(
        blockerDistribution[phase] ?? 0,
        count,
        'blocker count'
      );
    }
  }
  return { totals, blockerDistribution };
}

export function telemetryTargets(slices, totals) {
  const governanceRatio =
    totals.elapsedMs === 0 ? 0 : normalizedNumber(totals.governanceElapsedMs / totals.elapsedMs);
  const exactlyOneApprovalPerSlice = slices.every(slice => slice.approvals === 1);
  const atMostOneReFreezePerSlice = slices.every(slice => slice.reFreezes <= 1);
  const zeroOperationalMicroApprovals = slices.every(
    slice => slice.operationalMicroApprovals === 0
  );
  const governanceAtMost25Percent = governanceRatio <= 0.25;
  return {
    governanceRatio,
    targets: {
      exactlyOneApprovalPerSlice,
      atMostOneReFreezePerSlice,
      zeroOperationalMicroApprovals,
      governanceAtMost25Percent,
      allPassed:
        exactlyOneApprovalPerSlice &&
        atMostOneReFreezePerSlice &&
        zeroOperationalMicroApprovals &&
        governanceAtMost25Percent,
    },
  };
}
import { compareText } from './slice-rehearse-canonical.mjs';
