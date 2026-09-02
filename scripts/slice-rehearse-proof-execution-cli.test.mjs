import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson, deriveEvidenceIdentityKey, sha256 } from './slice-rehearse-canonical.mjs';
import {
  executePnpmProof,
  planInvalidatedProofs,
  recordHeavyProofExecution,
  runHeavyProofExecution,
  runHeavyProofRecordCli,
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

test('the default proof command uses absolute runtimes and a fixed non-writable PATH', () => {
  const calls = [];
  const result = executePnpmProof(['test:harness-v2'], {
    nodePath: '/trusted/bin/node',
    npmExecPath: '/trusted/lib/pnpm.cjs',
    spawn: (binary, args, options) => {
      calls.push({ binary, args, options });
      return { status: 0 };
    },
  });
  assert.equal(result.status, 0);
  assert.equal(calls[0].binary, '/trusted/bin/node');
  assert.deepEqual(calls[0].args, ['/trusted/lib/pnpm.cjs', 'test:harness-v2']);
  assert.deepEqual(calls[0].options.env, { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  assert.equal(calls[0].options.shell, false);
});

test('the default proof command resolves pnpm beside the active Node runtime', () => {
  assert.equal(executePnpmProof(['--version']).status, 0);
});

test('records and executes a planned proof through the copy-safe CLI contract', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-cli-'));
  const executionPath = path.join(root, 'execution.json');
  const reportPath = path.join(root, 'report.json');
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
  fs.writeFileSync(
    reportPath,
    JSON.stringify(proofReport({ lane: 'pr-e2e', evidenceKey: 'd'.repeat(64) }))
  );
  let stdout = '';
  let stderr = '';
  const commands = [];
  assert.equal(
    runHeavyProofRecordCli({
      argv: ['--report', reportPath, '--execution', executionPath, '--ledger', ledgerPath],
      cwd: root,
      stdout: value => {
        stdout += value;
      },
      stderr: value => {
        stderr += value;
      },
      executeProof: options =>
        runHeavyProofExecution({
          ...options,
          verifyCandidate: () => true,
          execute: args => {
            commands.push(args);
            return { status: 0 };
          },
        }),
    }),
    0
  );
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), {
    evidenceKey: 'd'.repeat(64),
    lane: 'pr-e2e',
    runId: 'run-cli-0001',
    status: 'succeeded',
  });
  assert.equal(commands.length, 2);
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

test('collapses historical decisions for one lane and reuses only the exact verified identity', () => {
  const expected = identity('a');
  const expectedKey = deriveEvidenceIdentityKey({ lane: 'pr-e2e', ...expected });
  assert.deepEqual(
    planInvalidatedProofs({
      requiredLanes: ['pr-e2e'],
      decisions: [receipt('pr-e2e', 'b'.repeat(64), false), receipt('pr-e2e', expectedKey, true)],
      expectedByLane: { 'pr-e2e': expected },
    }),
    { reuse: ['pr-e2e'], run: [] }
  );
  assert.deepEqual(
    planInvalidatedProofs({
      requiredLanes: ['pr-e2e'],
      decisions: [
        receipt('pr-e2e', 'b'.repeat(64), false),
        receipt('pr-e2e', 'c'.repeat(64), false),
      ],
      expectedByLane: { 'pr-e2e': expected },
    }),
    { reuse: [], run: [{ lane: 'pr-e2e', evidenceKey: expectedKey }] }
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
      expectedByLane: { 'pr-e2e': identity('a') },
      now: Date.parse('2026-08-31T02:00:00.000Z'),
    }),
    {
      reuse: [],
      run: [
        {
          lane: 'pr-e2e',
          evidenceKey: deriveEvidenceIdentityKey({ lane: 'pr-e2e', ...identity('a') }),
        },
      ],
    }
  );
});
