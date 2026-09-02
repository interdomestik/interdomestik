import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson, deriveEvidenceIdentityKey, sha256 } from './slice-rehearse-canonical.mjs';
import {
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

function proofReport(item) {
  const report = {
    schemaVersion: 1,
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

test('persists the no-duplicate contract atomically across process-local ledgers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-ledger-'));
  const ledgerPath = path.join(root, 'ledger.jsonl');
  const execution = {
    runId: 'run-0001',
    evidenceKey: 'c'.repeat(64),
    lane: 'pr-e2e',
    startedAt: '2026-08-31T00:00:00.000Z',
  };
  assert.equal(recordHeavyProofExecution({ ledgerPath, execution }), true);
  assert.throws(
    () => recordHeavyProofExecution({ ledgerPath, execution: { ...execution, runId: 'run-0002' } }),
    /receipt transition/u
  );
});

test('the proof executor runs only the fixed lane commands after claiming the evidence key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-executor-'));
  const commands = [];
  const result = runHeavyProofExecution({
    ledgerPath: path.join(root, 'ledger.jsonl'),
    execution: {
      runId: 'run-executor-0001',
      evidenceKey: 'f'.repeat(64),
      lane: 'pr-e2e',
      startedAt: '2026-08-31T00:00:00.000Z',
    },
    report: proofReport({ lane: 'pr-e2e', evidenceKey: 'f'.repeat(64) }),
    verifyCandidate: () => true,
    execute: args => {
      commands.push(args);
      return { status: 0 };
    },
  });
  assert.deepEqual(commands, [
    ['e2e:gate:pr'],
    ['--filter', '@interdomestik/web', 'run', 'e2e:smoke'],
  ]);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(
    fs
      .readFileSync(path.join(root, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line).status),
    ['reserved', 'running', 'succeeded']
  );
  assert.throws(
    () =>
      runHeavyProofExecution({
        ledgerPath: path.join(root, 'other-ledger.jsonl'),
        execution: {
          runId: 'run-executor-0002',
          evidenceKey: '0'.repeat(64),
          lane: 'pr-e2e',
          startedAt: '2026-08-31T00:00:00.000Z',
        },
        report: proofReport({ lane: 'pr-e2e', evidenceKey: 'f'.repeat(64) }),
        verifyCandidate: () => true,
      }),
    /outside the invalidated-only plan/u
  );
});

test('failed heavy proof is terminal and never becomes a reusable success receipt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-failed-'));
  const ledgerPath = path.join(root, 'ledger.jsonl');
  const execution = {
    runId: 'run-failed-0001',
    evidenceKey: '7'.repeat(64),
    lane: 'pr-e2e',
    startedAt: '2026-08-31T00:00:00.000Z',
  };
  const result = runHeavyProofExecution({
    ledgerPath,
    execution,
    report: proofReport({ lane: 'pr-e2e', evidenceKey: execution.evidenceKey }),
    verifyCandidate: () => true,
    execute: () => ({ status: null }),
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    fs
      .readFileSync(ledgerPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line).status),
    ['reserved', 'running', 'failed']
  );
  assert.throws(
    () =>
      recordHeavyProofExecution({ ledgerPath, execution: { ...execution, runId: 'retry-0001' } }),
    /receipt transition/u
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
        ledgerPath: path.join(os.tmpdir(), 'never-created-ledger.jsonl'),
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
