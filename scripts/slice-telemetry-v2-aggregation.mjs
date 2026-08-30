import { canonicalJson, compareText, must } from './slice-rehearse-canonical.mjs';
import { validateTelemetryEventV2 } from './slice-telemetry-v2-schema.mjs';

const GOVERNANCE_PHASES = new Set(['approval', 'design', 'deterministic_closeout', 'merge']);
const COUNT_KEYS = [
  'eventCount',
  'approvals',
  'deliveryApprovals',
  'operationalMicroApprovals',
  'globalHygieneApprovals',
  'reFreezes',
  'retries',
  'heavyProofs',
  'duplicateHeavyProofs',
];
const METRIC_KEYS = ['elapsedMs', 'governanceElapsedMs', 'runnerMinutes', 'modelCostUsd'];

function addNullable(current, value) {
  return current === null || value === null ? null : Number((current + value).toFixed(12));
}

function addCount(current, value, label) {
  const next = current + value;
  must(Number.isSafeInteger(next), `${label} aggregation overflowed`);
  return next;
}

function emptySlice(sliceId) {
  return {
    sliceId,
    eventCount: 0,
    elapsedMs: 0,
    governanceElapsedMs: 0,
    approvals: 0,
    deliveryApprovals: 0,
    operationalMicroApprovals: 0,
    globalHygieneApprovals: 0,
    reFreezes: 0,
    retries: 0,
    runnerMinutes: 0,
    modelCostUsd: 0,
    heavyProofs: 0,
    duplicateHeavyProofs: 0,
    evidenceKeys: [],
    blockerDistribution: {},
  };
}

function addEvent(slice, event) {
  slice.eventCount = addCount(slice.eventCount, 1, 'event count');
  slice.elapsedMs = addNullable(slice.elapsedMs, event.elapsedMs);
  if (GOVERNANCE_PHASES.has(event.phase)) {
    slice.governanceElapsedMs = addNullable(slice.governanceElapsedMs, event.elapsedMs);
  }
  slice.approvals = addCount(slice.approvals, event.approvals, 'approval count');
  const approvalKey = {
    delivery: 'deliveryApprovals',
    operational: 'operationalMicroApprovals',
    global_hygiene: 'globalHygieneApprovals',
  }[event.approvalClass];
  if (approvalKey) slice[approvalKey] = addCount(slice[approvalKey], event.approvals, approvalKey);
  slice.reFreezes = addCount(slice.reFreezes, event.reFreezes, 're-freeze count');
  slice.retries = addCount(slice.retries, event.retries, 'retry count');
  slice.runnerMinutes = addNullable(slice.runnerMinutes, event.runnerMinutes);
  slice.modelCostUsd = addNullable(slice.modelCostUsd, event.modelCostUsd);
  if (event.blockerPhase !== null && event.blockerPhase !== 'none') {
    slice.blockerDistribution[event.blockerPhase] = addCount(
      slice.blockerDistribution[event.blockerPhase] ?? 0,
      1,
      'blocker count'
    );
  }
  if (event.evidenceKey) slice.evidenceKeys.push(event.evidenceKey);
}

function finalize(slice) {
  slice.evidenceKeys.sort(compareText);
  slice.heavyProofs = slice.evidenceKeys.length;
  slice.duplicateHeavyProofs = slice.evidenceKeys.length - new Set(slice.evidenceKeys).size;
  return slice;
}

function aggregateTotals(slices) {
  const totals = Object.fromEntries([...COUNT_KEYS, ...METRIC_KEYS].map(key => [key, 0]));
  for (const slice of slices) {
    for (const key of COUNT_KEYS) totals[key] = addCount(totals[key], slice[key], key);
    for (const key of METRIC_KEYS) totals[key] = addNullable(totals[key], slice[key]);
  }
  return totals;
}

export function summarizeTelemetryV2(input) {
  must(Array.isArray(input) && input.length > 0, 'telemetry v2 events must not be empty');
  const events = input
    .map(validateTelemetryEventV2)
    .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
  must(
    new Set(events.map(canonicalJson)).size === events.length,
    'telemetry v2 events must be unique'
  );
  const map = new Map();
  for (const event of events) {
    const slice = map.get(event.sliceId) ?? emptySlice(event.sliceId);
    addEvent(slice, event);
    map.set(event.sliceId, slice);
  }
  const slices = [...map.values()].map(finalize).sort((a, b) => compareText(a.sliceId, b.sliceId));
  const totals = aggregateTotals(slices);
  const governanceRatio =
    totals.elapsedMs === null || totals.governanceElapsedMs === null || totals.elapsedMs === 0
      ? null
      : Number((totals.governanceElapsedMs / totals.elapsedMs).toFixed(12));
  const targets = {
    exactlyOneDeliveryApproval: slices.every(slice => slice.deliveryApprovals === 1),
    atMostOneReFreeze: slices.every(slice => slice.reFreezes <= 1),
    zeroOperationalMicroApprovals: totals.operationalMicroApprovals === 0,
    noDuplicateHeavyProof: totals.duplicateHeavyProofs === 0,
    atMostFiveToolingRetries: slices.every(slice => slice.retries <= 5),
    governanceAtMost25Percent: governanceRatio === null ? null : governanceRatio <= 0.25,
  };
  targets.allPassed = Object.entries(targets).every(([key, value]) =>
    key === 'governanceAtMost25Percent' ? value !== false : value === true
  );
  return {
    schemaVersion: 2,
    sliceCount: slices.length,
    eventCount: events.length,
    slices,
    totals,
    governanceRatio,
    targets,
  };
}
