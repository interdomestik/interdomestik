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

function receipt(lane, key, reusable) {
  const value = { lane, key, reusable };
  if (reusable) value.expiresAt = '2099-01-01T00:00:00.000Z';
  return value;
}

function identity(suffix) {
  return Object.fromEntries(
    [
      'headSha:40',
      'treeSha:40',
      'commandDigest:64',
      'workflowDigest:64',
      'substrateDigest:64',
      'writerMapDigest:64',
    ].map(field => {
      const [key, width] = field.split(':');
      return [key, suffix.repeat(Number(width))];
    })
  );
}

function proofReport(item, sliceId = 'HARNESS-V2-PROOF-PLAN') {
  const report = Object.assign(
    { reportSha256: null, authorityStops: [], schemaVersion: 1, sliceId },
    { evidence: { executionPlan: { reuse: [], run: [item] } } },
    { repository: { treeSha: '2'.repeat(40), headSha: '1'.repeat(40) } }
  );
  return { ...report, reportSha256: sha256(canonicalJson(report)) };
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

test('creates nested storage, persists successful proof, and rejects duplicates', () => {
  const scope = {
    sliceId: 'HARNESS-V2-PROOF-LEDGER',
    headSha: '1'.repeat(40),
    treeSha: '2'.repeat(40),
  };
  const parent = fs.mkdtempSync(join(tmpdir(), 'heavy-proof-ledger-'));
  const root = join(parent, 'state', 'proofs');
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
  fs.rmSync(parent, { recursive: true, force: true });
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

test('records failed heavy proof and leaves its evidence retryable', () => {
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
  let releases = 0;
  const execution = {
    runId: 'run-failed-0001',
    evidenceKey: '7'.repeat(64),
    lane: 'pr-e2e',
    startedAt: '2026-08-31T00:00:00.000Z',
  };
  const run = (status, runId, record = input => records.push(input)) =>
    runHeavyProofExecution({
      ledgerPath,
      execution: { ...execution, runId },
      report,
      verifyCandidate: () => true,
      verifyProofHost: () => true,
      acquireLease: () => () => (releases += 1),
      execute: () => ({ status }),
      record,
    });
  const result = run(null, execution.runId);
  assert.deepEqual([result.status, result.exitCode], ['failed', null]);
  assert.equal(records[0].ledgerPath, ledgerPath);
  assert.deepEqual(records[0].scope, scope);
  assert.deepEqual(records[0].execution, execution);
  assert.deepEqual(
    [records[0].status, records[0].exitCode, Number.isFinite(Date.parse(records[0].finishedAt))],
    ['failed', null, true]
  );
  const integer = run(17, 'run-failed-0002');
  assert.deepEqual([integer.status, integer.exitCode, records[1].exitCode], ['failed', 17, 17]);
  assert.throws(
    () =>
      run(1, 'run-failed-0003', () => {
        throw new Error('receipt write failed');
      }),
    /receipt write failed/u
  );
  assert.equal(releases, 3);
  assert.equal(run(0, 'run-failed-0004').status, 'succeeded');
  assert.equal(records.at(-1).status, 'succeeded');
  assert.equal(releases, 4);
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
