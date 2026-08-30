import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  BLOCKER_PHASES,
  TELEMETRY_PHASES,
  canonicalJson,
  parseTelemetryJsonl,
  summarizeTelemetry,
  validateTelemetryEvent,
} from './slice-telemetry.mjs';

const evidenceKey = 'a'.repeat(64);
function event(overrides = {}) {
  return {
    schemaVersion: 1,
    sliceId: 'T117B-DATA',
    phase: 'implementation',
    elapsedMs: 1_000,
    waitMs: 250,
    computeMs: 750,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    runnerMinutes: 0,
    modelCostUsd: null,
    blockerPhase: 'none',
    evidenceKey: null,
    ...overrides,
  };
}

test('validates and normalizes the closed telemetry event schema', () => {
  const normalized = validateTelemetryEvent(
    event({
      phase: 'proof',
      modelCostUsd: 0.42,
      blockerPhase: 'runner',
      evidenceKey,
    })
  );

  assert.deepEqual(
    normalized,
    event({
      phase: 'proof',
      modelCostUsd: 0.42,
      blockerPhase: 'runner',
      evidenceKey,
    })
  );
  assert.deepEqual(
    [...TELEMETRY_PHASES],
    ['rehearsal', 'approval', 'implementation', 'proof', 'review', 'merge', 'closeout']
  );
  assert.deepEqual(
    [...BLOCKER_PHASES],
    [
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
    ]
  );
});

test('rejects malformed, identifying, free-text, and inconsistent events', () => {
  const invalidEvents = [
    { ...event(), note: 'free text' },
    { ...event(), userEmail: 'person@example.com' },
    { ...event(), sliceId: 'invalid slice identifier with spaces' },
    { ...event(), phase: 'coding' },
    { ...event(), blockerPhase: 'mystery' },
    { ...event(), elapsedMs: 999 },
    { ...event(), approvals: -1 },
    { ...event(), retries: 0.5 },
    { ...event(), runnerMinutes: -0.1 },
    { ...event(), modelCostUsd: Number.NaN },
    { ...event(), evidenceKey: 'not-a-key' },
  ];

  for (const invalid of invalidEvents) {
    assert.throws(() => validateTelemetryEvent(invalid));
  }

  const missing = event();
  delete missing.computeMs;
  assert.throws(() => validateTelemetryEvent(missing));
});

test('parses non-empty JSONL without accepting partial or blank records', () => {
  const first = event();
  const second = event({ phase: 'proof', evidenceKey });
  assert.deepEqual(parseTelemetryJsonl(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`), [
    first,
    second,
  ]);
  assert.deepEqual(
    parseTelemetryJsonl(`${JSON.stringify(first)}\r\n${JSON.stringify(second)}\r\n`),
    [first, second]
  );
  assert.throws(() => parseTelemetryJsonl(''));
  assert.throws(() => parseTelemetryJsonl(`${JSON.stringify(first)}\n\n`));
  assert.throws(() => parseTelemetryJsonl('{"schemaVersion":1}\n'));
});

test('summarizes three slices deterministically and evaluates all efficiency targets', () => {
  const events = [
    event({
      sliceId: 'T-101',
      phase: 'rehearsal',
      elapsedMs: 100,
      waitMs: 20,
      computeMs: 80,
      approvals: 1,
      modelCostUsd: 0.5,
    }),
    event({
      sliceId: 'T-101',
      phase: 'implementation',
      elapsedMs: 900,
      waitMs: 100,
      computeMs: 800,
      runnerMinutes: 4.5,
      modelCostUsd: 1.25,
    }),
    event({
      sliceId: 'T-102',
      phase: 'approval',
      elapsedMs: 200,
      waitMs: 200,
      computeMs: 0,
      approvals: 1,
      blockerPhase: 'approval',
    }),
    event({
      sliceId: 'T-102',
      phase: 'implementation',
      elapsedMs: 800,
      waitMs: 100,
      computeMs: 700,
      reFreezes: 1,
      retries: 1,
      blockerPhase: 'capacity',
      runnerMinutes: 6,
    }),
    event({
      sliceId: 'T-103',
      phase: 'implementation',
      elapsedMs: 800,
      waitMs: 100,
      computeMs: 700,
      approvals: 1,
      runnerMinutes: 2,
    }),
    event({
      sliceId: 'T-103',
      phase: 'proof',
      elapsedMs: 200,
      waitMs: 0,
      computeMs: 200,
      evidenceKey,
      modelCostUsd: 0.25,
    }),
  ];
  const summary = summarizeTelemetry(events);
  assert.deepEqual(summary.totals, {
    elapsedMs: 3_000,
    waitMs: 520,
    computeMs: 2_480,
    approvals: 3,
    reFreezes: 1,
    retries: 1,
    runnerMinutes: 12.5,
    modelCostUsd: null,
    governanceElapsedMs: 300,
    reviewElapsedMs: 0,
    duplicateHeavyProofs: 0,
  });
  assert.equal(summary.governanceRatio, 0.1);
  assert.equal(summary.sliceCount, 3);
  assert.deepEqual(summary.blockerDistribution, { approval: 1, capacity: 1 });
  assert.deepEqual(summary.targets, {
    exactlyOneApprovalPerSlice: true,
    atMostOneReFreezePerSlice: true,
    zeroOperationalMicroApprovals: true,
    governanceAtMost25Percent: true,
    noDuplicateHeavyProof: true,
    allPassed: true,
  });
  assert.equal(canonicalJson(summary), canonicalJson(summarizeTelemetry([...events].reverse())));
});
test('rejects duplicate records and reports unknown model cost honestly', () => {
  const unknown = event({ sliceId: 'T-104', approvals: 1, modelCostUsd: null });
  assert.throws(() => summarizeTelemetry([unknown, unknown]), /unique/u);

  const summary = summarizeTelemetry([unknown]);
  assert.equal(summary.slices[0].modelCostUsd, null);
  assert.equal(summary.totals.modelCostUsd, null);

  const known = summarizeTelemetry([event({ sliceId: 'T-105', approvals: 1, modelCostUsd: 0.75 })]);
  assert.equal(known.slices[0].modelCostUsd, 0.75);
  assert.equal(known.totals.modelCostUsd, 0.75);
});
test('fails target verdicts without hiding the measured totals', () => {
  const summary = summarizeTelemetry([
    event({
      sliceId: 'T-201',
      phase: 'approval',
      elapsedMs: 400,
      waitMs: 400,
      computeMs: 0,
      approvals: 2,
    }),
    event({
      sliceId: 'T-201',
      elapsedMs: 600,
      waitMs: 0,
      computeMs: 600,
      approvals: 1,
      reFreezes: 2,
      blockerPhase: 'capacity',
    }),
    event({ sliceId: 'T-202', elapsedMs: 0, waitMs: 0, computeMs: 0, approvals: 0 }),
    event({ sliceId: 'T-203', elapsedMs: 0, waitMs: 0, computeMs: 0, approvals: 1 }),
  ]);

  assert.deepEqual(summary.targets, {
    exactlyOneApprovalPerSlice: false,
    atMostOneReFreezePerSlice: false,
    zeroOperationalMicroApprovals: false,
    governanceAtMost25Percent: false,
    noDuplicateHeavyProof: true,
    allPassed: false,
  });
});

test('CLI reads exactly one input and emits canonical JSON without modifying it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slice-telemetry-'));
  const input = join(directory, 'events.jsonl');
  const bytes = `${JSON.stringify(event({ sliceId: 'T-301', approvals: 1 }))}\n`;
  writeFileSync(input, bytes);

  const stdout = execFileSync(process.execPath, ['scripts/slice-telemetry.mjs', '--input', input], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(stdout, canonicalJson(summarizeTelemetry(parseTelemetryJsonl(bytes))));
  assert.equal(readFileSync(input, 'utf8'), bytes);

  for (const args of [[], ['--input'], ['--other', input], ['--input', input, 'extra']]) {
    const result = spawnSync(process.execPath, ['scripts/slice-telemetry.mjs', ...args], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
  }
});

test('CLI rejects symlink, FIFO, and oversized telemetry inputs without blocking', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slice-telemetry-unsafe-'));
  try {
    const regular = join(directory, 'events.jsonl');
    const linked = join(directory, 'linked.jsonl');
    const fifo = join(directory, 'events.fifo');
    const oversized = join(directory, 'oversized.jsonl');
    writeFileSync(regular, `${JSON.stringify(event({ approvals: 1 }))}\n`);
    symlinkSync(regular, linked);
    execFileSync('/usr/bin/mkfifo', [fifo]);
    writeFileSync(oversized, ' '.repeat(16 * 1024 * 1024 + 1));

    for (const input of [linked, fifo, oversized]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/slice-telemetry.mjs', '--input', input],
        {
          cwd: new URL('..', import.meta.url),
          encoding: 'utf8',
          timeout: 2_000,
        }
      );
      assert.equal(result.signal, null, `input must fail without timeout: ${input}`);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
