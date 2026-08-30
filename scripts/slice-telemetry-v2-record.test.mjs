import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendEvent, recordTelemetryEvent } from './slice-telemetry-v2-record.mjs';

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

test('ledger creation uses the trusted path boundary and rejects symlinked parents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-telemetry-'));
  const eventPath = path.join(root, 'event.json');
  const ledgerPath = path.join(root, 'events.jsonl');
  fs.writeFileSync(eventPath, `${JSON.stringify(event)}\n`);

  appendEvent({ eventPath, ledgerPath, trustedRoots: [root] });
  assert.equal(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).sliceId, 'HARNESS-V2-1');
  assert.throws(() => appendEvent({ eventPath, ledgerPath, trustedRoots: [root] }), /duplicate/u);

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-telemetry-outside-'));
  const link = path.join(root, 'linked');
  fs.symlinkSync(outside, link);
  assert.throws(
    () =>
      appendEvent({
        eventPath,
        ledgerPath: path.join(link, 'events.jsonl'),
        trustedRoots: [root],
      }),
    /symlink/u
  );
});
