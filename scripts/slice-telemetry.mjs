import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import { readBoundedRegularText } from './slice-rehearse-evidence.mjs';
import {
  canonicalJson,
  canonicalize,
  compareText,
  exactKeys,
  must,
} from './slice-rehearse-canonical.mjs';
import {
  addTelemetryEvent,
  aggregateTelemetryTotals,
  checkedIntegerSum,
  emptyTelemetrySlice,
  telemetryTargets,
} from './slice-telemetry-aggregation.mjs';
export { canonicalJson } from './slice-rehearse-canonical.mjs';

export const TELEMETRY_PHASES = Object.freeze([
  'rehearsal',
  'approval',
  'implementation',
  'proof',
  'review',
  'merge',
  'closeout',
]);

export const BLOCKER_PHASES = Object.freeze([
  'none',
  'rehearsal',
  'approval',
  'capacity',
  'implementation',
  'runner',
  'review',
  'merge',
  'closeout',
  'provider',
]);

const EVENT_KEYS = Object.freeze([
  'approvals',
  'blockerPhase',
  'computeMs',
  'elapsedMs',
  'evidenceKey',
  'modelCostUsd',
  'phase',
  'reFreezes',
  'retries',
  'runnerMinutes',
  'schemaVersion',
  'sliceId',
  'waitMs',
]);
const EVIDENCE_KEY_PATTERN = /^[0-9a-f]{64}$/u;
const SLICE_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,63}$/u;
const MAX_TELEMETRY_BYTES = 16 * 1024 * 1024;

function nonNegativeInteger(value, label) {
  must(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function nonNegativeNumber(value, label) {
  must(Number.isFinite(value) && value >= 0, `${label} must be a non-negative finite number`);
  return value;
}

export function validateTelemetryEvent(input) {
  exactKeys(input, EVENT_KEYS, 'telemetry event');
  must(input.schemaVersion === 1, 'unsupported telemetry schema version');
  must(
    typeof input.sliceId === 'string' && SLICE_ID_PATTERN.test(input.sliceId),
    'slice ID is invalid'
  );
  must(TELEMETRY_PHASES.includes(input.phase), 'telemetry phase is invalid');

  const elapsedMs = nonNegativeInteger(input.elapsedMs, 'elapsed milliseconds');
  const waitMs = nonNegativeInteger(input.waitMs, 'wait milliseconds');
  const computeMs = nonNegativeInteger(input.computeMs, 'compute milliseconds');
  must(
    checkedIntegerSum(waitMs, computeMs, 'elapsed milliseconds') === elapsedMs,
    'elapsed milliseconds must equal wait plus compute'
  );

  const approvals = nonNegativeInteger(input.approvals, 'approvals');
  const reFreezes = nonNegativeInteger(input.reFreezes, 're-freezes');
  const retries = nonNegativeInteger(input.retries, 'retries');
  const runnerMinutes = nonNegativeNumber(input.runnerMinutes, 'runner minutes');
  const modelCostUsd =
    input.modelCostUsd === null ? null : nonNegativeNumber(input.modelCostUsd, 'model cost in USD');
  must(BLOCKER_PHASES.includes(input.blockerPhase), 'blocker phase is invalid');
  must(
    input.evidenceKey === null ||
      (typeof input.evidenceKey === 'string' && EVIDENCE_KEY_PATTERN.test(input.evidenceKey)),
    'evidence key is invalid'
  );

  return {
    schemaVersion: 1,
    sliceId: input.sliceId,
    phase: input.phase,
    elapsedMs,
    waitMs,
    computeMs,
    approvals,
    reFreezes,
    retries,
    runnerMinutes,
    modelCostUsd,
    blockerPhase: input.blockerPhase,
    evidenceKey: input.evidenceKey,
  };
}

export function parseTelemetryJsonl(text) {
  must(typeof text === 'string' && text.length > 0, 'telemetry JSONL must not be empty');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  must(
    lines.length > 0 && lines.every(line => line.length > 0),
    'telemetry JSONL has a blank record'
  );
  return lines.map((line, index) => {
    try {
      return validateTelemetryEvent(JSON.parse(line));
    } catch (error) {
      throw new Error(`telemetry record ${index + 1} is invalid`, { cause: error });
    }
  });
}

export function summarizeTelemetry(inputEvents) {
  must(Array.isArray(inputEvents) && inputEvents.length > 0, 'telemetry events must not be empty');
  const events = inputEvents
    .map(validateTelemetryEvent)
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const eventIdentities = events.map(canonicalJson);
  must(new Set(eventIdentities).size === events.length, 'telemetry events must be unique');
  const bySlice = new Map();
  for (const event of events) {
    const summary = bySlice.get(event.sliceId) ?? emptyTelemetrySlice(event.sliceId);
    addTelemetryEvent(summary, event);
    bySlice.set(event.sliceId, summary);
  }

  const slices = [...bySlice.values()]
    .sort((left, right) => compareText(left.sliceId, right.sliceId))
    .map(slice => {
      const { modelCostComplete, operationalApprovals, ...publicSlice } = slice;
      return {
        ...publicSlice,
        modelCostUsd: modelCostComplete ? slice.modelCostUsd : null,
        operationalMicroApprovals: Math.min(operationalApprovals, Math.max(0, slice.approvals - 1)),
        blockerDistribution: canonicalize(slice.blockerDistribution),
      };
    });
  const { totals, blockerDistribution } = aggregateTelemetryTotals(slices);
  const { governanceRatio, targets } = telemetryTargets(slices, totals);

  return {
    schemaVersion: 1,
    sliceCount: slices.length,
    eventCount: events.length,
    slices,
    totals,
    blockerDistribution: canonicalize(blockerDistribution),
    governanceRatio,
    targets,
  };
}

function runCli(argv) {
  must(argv.length === 2 && argv[0] === '--input' && argv[1].length > 0, 'usage: --input <path>');
  const events = parseTelemetryJsonl(
    readBoundedRegularText(argv[1], {
      label: 'Telemetry input',
      maxBytes: MAX_TELEMETRY_BYTES,
      allowedRoots: [process.cwd(), tmpdir()],
    })
  );
  process.stdout.write(canonicalJson(summarizeTelemetry(events)));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try {
    runCli(process.argv.slice(2));
  } catch {
    process.stderr.write('slice telemetry input is invalid\n');
    process.exitCode = 1;
  }
}
