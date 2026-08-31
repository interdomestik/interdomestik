import { exactKeys, must } from './slice-rehearse-canonical.mjs';

export const TELEMETRY_V2_PHASES = Object.freeze([
  'approval',
  'design',
  'deterministic_closeout',
  'global_hygiene',
  'implementation',
  'merge',
  'proof',
  'review',
]);
const APPROVAL_CLASSES = new Set(['delivery', 'global_hygiene', 'none', 'operational']);
const KEYS = [
  'approvalClass',
  'approvals',
  'blockerPhase',
  'computeMs',
  'elapsedMs',
  'evidenceKey',
  'eventId',
  'modelCostUsd',
  'phase',
  'reFreezes',
  'retries',
  'runnerMinutes',
  'runId',
  'schemaVersion',
  'sliceId',
  'waitMs',
];
const SHA256 = /^[0-9a-f]{64}$/u;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;

function count(value, label) {
  must(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function metric(value, label) {
  must(
    value === null || (Number.isFinite(value) && value >= 0),
    `${label} must be null or non-negative`
  );
}

export function validateTelemetryEventV2(input) {
  exactKeys(input, KEYS, 'telemetry v2 event');
  must(input.schemaVersion === 2, 'unsupported telemetry v2 schema');
  must(/^[A-Z0-9][A-Z0-9-]{1,63}$/u.test(input.sliceId), 'slice ID is invalid');
  must(TELEMETRY_V2_PHASES.includes(input.phase), 'telemetry phase is invalid');
  must(APPROVAL_CLASSES.has(input.approvalClass), 'approval class is invalid');
  const approvals = count(input.approvals, 'approvals');
  count(input.reFreezes, 're-freezes');
  count(input.retries, 'retries');
  must(
    (approvals === 0) === (input.approvalClass === 'none'),
    'approval class differs from approval count'
  );
  if (input.approvalClass === 'global_hygiene') {
    must(input.phase === 'global_hygiene', 'global hygiene approval phase differs');
  }
  if (input.approvalClass === 'delivery') {
    must(['approval', 'design'].includes(input.phase), 'delivery approval phase differs');
  }
  if (input.approvalClass === 'operational') {
    must(input.phase === 'approval', 'operational approval phase differs');
  }
  const timing = [input.elapsedMs, input.waitMs, input.computeMs];
  must(
    timing.every(value => value === null) || timing.every(Number.isSafeInteger),
    'timing decomposition must be complete or null'
  );
  if (timing[0] !== null) {
    timing.forEach((value, index) => count(value, ['elapsed', 'wait', 'compute'][index]));
    must(
      input.waitMs + input.computeMs === input.elapsedMs,
      'elapsed time differs from decomposition'
    );
  }
  metric(input.runnerMinutes, 'runner minutes');
  metric(input.modelCostUsd, 'model cost');
  must(
    input.blockerPhase === null ||
      (typeof input.blockerPhase === 'string' && input.blockerPhase.length > 0),
    'blocker phase is invalid'
  );
  must(input.evidenceKey === null || SHA256.test(input.evidenceKey), 'evidence key is invalid');
  must(EVENT_ID.test(input.eventId ?? ''), 'event ID is invalid');
  must(input.runId === null || EVENT_ID.test(input.runId), 'run ID is invalid');
  must(
    input.evidenceKey === null || (input.phase === 'proof' && input.runId !== null),
    'proof evidence requires an immutable run ID'
  );
  return { ...input };
}
