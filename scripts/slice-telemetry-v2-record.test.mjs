import assert from 'node:assert/strict';
import test from 'node:test';

import { recordTelemetryEvent } from './slice-telemetry-v2-record.mjs';

const event = {
  schemaVersion: 2,
  sliceId: 'HARNESS-V2-1',
  phase: 'design',
  approvalClass: 'delivery',
  elapsedMs: null,
  waitMs: null,
  computeMs: null,
  approvals: 1,
  reFreezes: 0,
  retries: 0,
  runnerMinutes: null,
  modelCostUsd: null,
  blockerPhase: null,
  evidenceKey: null,
};

test('records one canonical phase-aware event without inventing unknown values', () => {
  const record = recordTelemetryEvent({ event, existingText: '' });
  assert.equal(record.split('\n').length, 2);
  assert.equal(JSON.parse(record).runnerMinutes, null);
});

test('rejects a duplicate record and malformed existing JSONL', () => {
  assert.throws(
    () =>
      recordTelemetryEvent({
        event,
        existingText: recordTelemetryEvent({ event, existingText: '' }),
      }),
    /duplicate telemetry event/u
  );
  assert.throws(
    () => recordTelemetryEvent({ event, existingText: '{"broken":true}' }),
    /JSONL framing/u
  );
});
