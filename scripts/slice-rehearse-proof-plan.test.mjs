import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertHeavyProofExecution,
  planInvalidatedProofs,
  recordHeavyProofExecution,
  runHeavyProofRecordCli,
} from './slice-rehearse-proof-plan.mjs';

const receipt = (lane, key, reusable) => ({
  lane,
  key,
  reusable,
  ...(reusable ? { expiresAt: '2099-01-01T00:00:00.000Z' } : {}),
});

test('plans only invalidated or missing proof lanes in deterministic code-unit order', () => {
  const plan = planInvalidatedProofs({
    requiredLanes: ['pr-e2e', 'CodeQL', 'sonar'],
    decisions: [receipt('pr-e2e', 'a'.repeat(64), true), receipt('CodeQL', 'b'.repeat(64), false)],
  });

  assert.deepEqual(plan.reuse, ['pr-e2e']);
  assert.deepEqual(plan.run, ['CodeQL', 'sonar']);
});

test('enforces the no-duplicate-heavy-proof execution contract', () => {
  const ledger = new Set(['a'.repeat(64)]);
  assert.throws(
    () => assertHeavyProofExecution({ evidenceKey: 'a'.repeat(64), ledger }),
    /duplicate heavy proof is forbidden/u
  );
  assert.equal(assertHeavyProofExecution({ evidenceKey: 'b'.repeat(64), ledger }), true);
  assert.ok(ledger.has('b'.repeat(64)));
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
    /duplicate heavy proof/u
  );
});

test('records a planned execution through the copy-safe CLI contract', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-cli-'));
  const executionPath = path.join(root, 'execution.json');
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(
    executionPath,
    JSON.stringify({
      runId: 'run-cli-0001',
      evidenceKey: 'd'.repeat(64),
      lane: 'pr-e2e',
      startedAt: '2026-08-31T00:00:00.000Z',
    })
  );
  let stdout = '';
  let stderr = '';
  assert.equal(
    runHeavyProofRecordCli({
      argv: ['--execution', executionPath, '--ledger', ledgerPath],
      cwd: root,
      stdout: value => {
        stdout += value;
      },
      stderr: value => {
        stderr += value;
      },
    }),
    0
  );
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), {
    evidenceKey: 'd'.repeat(64),
    lane: 'pr-e2e',
    recorded: true,
    runId: 'run-cli-0001',
  });
  assert.match(fs.readFileSync(ledgerPath, 'utf8'), /run-cli-0001/u);
});

test('does not remove another process lock when ledger acquisition fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-lock-'));
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(`${ledgerPath}.lock`, 'owner');
  assert.throws(
    () =>
      recordHeavyProofExecution({
        ledgerPath,
        execution: {
          runId: 'run-lock-0001',
          evidenceKey: 'e'.repeat(64),
          lane: 'pr-e2e',
          startedAt: '2026-08-31T00:00:00.000Z',
        },
      }),
    /EEXIST/u
  );
  assert.equal(fs.readFileSync(`${ledgerPath}.lock`, 'utf8'), 'owner');
});

test('rejects ambiguous duplicate lane decisions instead of rerunning speculatively', () => {
  assert.throws(
    () =>
      planInvalidatedProofs({
        requiredLanes: ['pr-e2e'],
        decisions: [
          receipt('pr-e2e', 'a'.repeat(64), true),
          receipt('pr-e2e', 'b'.repeat(64), false),
        ],
      }),
    /lane decision must be unique/u
  );
});

test('revalidates independently verified expiry when proof is consumed', () => {
  const decision = {
    lane: 'pr-e2e',
    key: 'a'.repeat(64),
    reusable: true,
    evaluatedAt: '2026-08-31T00:00:00.000Z',
    expiresAt: '2026-08-31T01:00:00.000Z',
  };
  assert.deepEqual(
    planInvalidatedProofs({
      requiredLanes: ['pr-e2e'],
      decisions: [decision],
      now: Date.parse('2026-08-31T02:00:00.000Z'),
    }),
    { reuse: [], run: ['pr-e2e'] }
  );
});
