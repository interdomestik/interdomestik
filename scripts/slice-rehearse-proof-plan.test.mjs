import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, deriveEvidenceIdentityKey, sha256 } from './slice-rehearse-canonical.mjs';
import {
  acquireHeavyProofExecutionLease,
  heavyProofLedgerPath,
  planInvalidatedProofs,
  recordHeavyProofExecution,
  runHeavyProofExecution,
} from './slice-rehearse-proof-plan.mjs';

const receipt = (lane, key, reusable) => ({
  lane,
  key,
  reusable,
  ...(reusable ? { expiresAt: '2099-01-01T00:00:00.000Z' } : {}),
});

const identity = suffix => ({
  headSha: suffix.repeat(40),
  treeSha: suffix.repeat(40),
  commandDigest: suffix.repeat(64),
  workflowDigest: suffix.repeat(64),
  substrateDigest: suffix.repeat(64),
  writerMapDigest: suffix.repeat(64),
});

function proofReport(item, sliceId = 'HARNESS-V2-PROOF-PLAN') {
  const report = {
    schemaVersion: 1,
    sliceId,
    repository: { headSha: '1'.repeat(40), treeSha: '2'.repeat(40) },
    authorityStops: [],
    evidence: { executionPlan: { reuse: [], run: [item] } },
    reportSha256: null,
  };
  report.reportSha256 = sha256(canonicalJson(report));
  return report;
}

test('plans only invalidated or missing proof lanes in deterministic code-unit order', () => {
  const prE2e = identity('a');
  const plan = planInvalidatedProofs({
    requiredLanes: ['pr-e2e', 'CodeQL', 'sonar'],
    decisions: [
      receipt('pr-e2e', deriveEvidenceIdentityKey({ lane: 'pr-e2e', ...prE2e }), true),
      receipt('CodeQL', 'b'.repeat(64), false),
    ],
    expectedByLane: {
      'pr-e2e': prE2e,
      CodeQL: identity('b'),
      sonar: identity('c'),
    },
  });

  assert.deepEqual(plan.reuse, ['pr-e2e']);
  assert.deepEqual(
    plan.run.map(item => item.lane),
    ['CodeQL', 'sonar']
  );
  assert.ok(plan.run.every(item => /^[0-9a-f]{64}$/u.test(item.evidenceKey)));
});

test('persists only successful proof claims and rejects a duplicate success atomically', () => {
  const scope = {
    sliceId: 'HARNESS-V2-PROOF-LEDGER',
    headSha: '1'.repeat(40),
    treeSha: '2'.repeat(40),
  };
  const root = fs.mkdtempSync(join(tmpdir(), 'heavy-proof-ledger-'));
  const ledgerPath = heavyProofLedgerPath(scope, root);
  fs.rmSync(ledgerPath, { force: true });
  const execution = {
    runId: 'run-0001',
    evidenceKey: 'c'.repeat(64),
    lane: 'pr-e2e',
    startedAt: '2026-08-31T00:00:00.000Z',
  };
  assert.equal(
    recordHeavyProofExecution({
      ledgerPath,
      scope,
      execution,
      ledgerRoot: root,
      status: 'succeeded',
      finishedAt: '2026-08-31T00:01:00.000Z',
      exitCode: 0,
    }),
    true
  );
  assert.throws(
    () =>
      recordHeavyProofExecution({
        ledgerPath,
        scope,
        execution: { ...execution, runId: 'run-0002' },
        ledgerRoot: root,
        status: 'succeeded',
        finishedAt: '2026-08-31T00:02:00.000Z',
        exitCode: 0,
      }),
    /receipt transition/u
  );
  assert.throws(
    () =>
      recordHeavyProofExecution({
        ledgerPath: `${ledgerPath}.alternate`,
        scope,
        execution,
        ledgerRoot: root,
        status: 'succeeded',
        finishedAt: '2026-08-31T00:01:00.000Z',
        exitCode: 0,
      }),
    /canonical evidence scope/u
  );
  assert.throws(
    () => acquireHeavyProofExecutionLease({ ledgerPath, scope, execution, ledgerRoot: root }),
    /already succeeded/u
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('the proof executor claims the evidence key only after every command succeeds', () => {
  const report = proofReport(
    { lane: 'pr-e2e', evidenceKey: 'f'.repeat(64) },
    'HARNESS-V2-PROOF-EXECUTOR'
  );
  const ledgerPath = heavyProofLedgerPath({
    sliceId: report.sliceId,
    headSha: report.repository.headSha,
    treeSha: report.repository.treeSha,
  });
  const commands = [];
  const records = [];
  const events = [];
  const result = runHeavyProofExecution({
    ledgerPath,
    execution: {
      runId: 'run-executor-0001',
      evidenceKey: 'f'.repeat(64),
      lane: 'pr-e2e',
      startedAt: '2026-08-31T00:00:00.000Z',
    },
    report,
    verifyCandidate: () => true,
    verifyProofHost: () => true,
    acquireLease: () => () => {},
    execute: args => {
      commands.push(args);
      events.push('command');
      return { status: 0 };
    },
    record: input => {
      records.push(input.status);
      events.push('receipt');
    },
  });
  assert.deepEqual(commands, [
    ['e2e:gate:pr'],
    ['--filter', '@interdomestik/web', 'run', 'e2e:smoke'],
  ]);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(records, ['succeeded']);
  assert.deepEqual(events, ['command', 'command', 'receipt']);
  assert.throws(
    () =>
      runHeavyProofExecution({
        ledgerPath,
        execution: {
          runId: 'run-executor-0002',
          evidenceKey: '0'.repeat(64),
          lane: 'pr-e2e',
          startedAt: '2026-08-31T00:00:00.000Z',
        },
        report: proofReport({ lane: 'pr-e2e', evidenceKey: 'f'.repeat(64) }),
        verifyCandidate: () => true,
        verifyProofHost: () => true,
        acquireLease: () => () => {},
      }),
    /outside the invalidated-only plan/u
  );
});

test('failed heavy proof records no claim and remains retryable', () => {
  const report = proofReport(
    { lane: 'pr-e2e', evidenceKey: '7'.repeat(64) },
    'HARNESS-V2-PROOF-FAILED'
  );
  const scope = {
    sliceId: report.sliceId,
    headSha: report.repository.headSha,
    treeSha: report.repository.treeSha,
  };
  const ledgerPath = heavyProofLedgerPath(scope);
  const records = [];
  const execution = {
    runId: 'run-failed-0001',
    evidenceKey: '7'.repeat(64),
    lane: 'pr-e2e',
    startedAt: '2026-08-31T00:00:00.000Z',
  };
  const result = runHeavyProofExecution({
    ledgerPath,
    execution,
    report,
    verifyCandidate: () => true,
    verifyProofHost: () => true,
    acquireLease: () => () => {},
    execute: () => ({ status: null }),
    record: input => records.push(input.status ?? 'reserved'),
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(records, []);
  const retry = runHeavyProofExecution({
    ledgerPath,
    execution: { ...execution, runId: 'run-failed-0002' },
    report,
    verifyCandidate: () => true,
    verifyProofHost: () => true,
    acquireLease: () => () => {},
    execute: () => ({ status: 0 }),
    record: input => records.push(input.status),
  });
  assert.equal(retry.status, 'succeeded');
  assert.deepEqual(records, ['succeeded']);
});

test('heavy proof refuses an unauthorized host before lease or command execution', () => {
  const report = proofReport(
    { lane: 'pr-e2e', evidenceKey: '5'.repeat(64) },
    'HARNESS-V2-PROOF-HOST'
  );
  assert.throws(
    () =>
      runHeavyProofExecution({
        ledgerPath: heavyProofLedgerPath({
          sliceId: report.sliceId,
          headSha: report.repository.headSha,
          treeSha: report.repository.treeSha,
        }),
        execution: {
          runId: 'run-host-0001',
          evidenceKey: '5'.repeat(64),
          lane: 'pr-e2e',
          startedAt: '2026-08-31T00:00:00.000Z',
        },
        report,
        verifyCandidate: () => true,
        verifyProofHost: () => false,
        acquireLease: () => assert.fail('lease must not be acquired'),
        execute: () => assert.fail('heavy proof must not execute'),
        record: () => assert.fail('heavy proof must not be recorded'),
      }),
    /heavy proof host is unauthorized/u
  );
});

test('pending identity-changing work blocks heavy proof dispatch', () => {
  const item = { lane: 'pr-e2e', evidenceKey: '6'.repeat(64) };
  const report = proofReport(item);
  report.operationalEnvelope = { requiredOperations: ['derived_capacity_rebind'] };
  report.reportSha256 = sha256(canonicalJson({ ...report, reportSha256: null }));
  assert.throws(
    () =>
      runHeavyProofExecution({
        ledgerPath: heavyProofLedgerPath({
          sliceId: report.sliceId,
          headSha: report.repository.headSha,
          treeSha: report.repository.treeSha,
        }),
        execution: {
          runId: 'run-blocked-0001',
          evidenceKey: item.evidenceKey,
          lane: item.lane,
          startedAt: '2026-08-31T00:00:00.000Z',
        },
        report,
        verifyCandidate: () => true,
      }),
    /identity-changing work is pending/u
  );
});
