import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson, deriveEvidenceIdentityKey, sha256 } from './slice-rehearse-canonical.mjs';
import {
  executePnpmProof,
  heavyProofLedgerPath,
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

function proofReport(item, sliceId = 'HARNESS-V2-PROOF-CLI') {
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

test('proof command uses trusted runtimes and PATH', () => {
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

test('proof command resolves pnpm beside Node', () => {
  assert.equal(executePnpmProof(['--version']).status, 0);
});

test('executes and records a planned proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-cli-'));
  const executionPath = path.join(root, 'execution.json');
  const reportPath = path.join(root, 'report.json');
  const report = proofReport({ lane: 'pr-e2e', evidenceKey: 'd'.repeat(64) });
  const ledgerPath = heavyProofLedgerPath({
    sliceId: report.sliceId,
    headSha: report.repository.headSha,
    treeSha: report.repository.treeSha,
  });
  fs.rmSync(ledgerPath, { force: true });
  fs.writeFileSync(
    executionPath,
    JSON.stringify({
      runId: 'run-cli-0001',
      evidenceKey: 'd'.repeat(64),
      lane: 'pr-e2e',
      startedAt: '2026-08-31T00:00:00.000Z',
    })
  );
  fs.writeFileSync(reportPath, JSON.stringify(report));
  let stdout = '';
  let stderr = '';
  const commands = [];
  const records = [];
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
          verifyProofHost: () => true,
          acquireLease: () => () => {},
          execute: args => {
            commands.push(args);
            return { status: 0 };
          },
          record: input => records.push(input.status ?? 'reserved'),
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
  assert.deepEqual(records, ['succeeded']);
});

test('preserves another process lock', () => {
  const scope = {
    sliceId: 'HARNESS-V2-PROOF-LOCK',
    headSha: '1'.repeat(40),
    treeSha: '2'.repeat(40),
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-proof-lock-'));
  const ledgerPath = heavyProofLedgerPath(scope, root);
  fs.rmSync(ledgerPath, { force: true });
  fs.writeFileSync(`${ledgerPath}.lock`, 'owner');
  assert.throws(
    () =>
      recordHeavyProofExecution({
        ledgerPath,
        scope,
        ledgerRoot: root,
        execution: {
          runId: 'run-lock-0001',
          evidenceKey: 'e'.repeat(64),
          lane: 'pr-e2e',
          startedAt: '2026-08-31T00:00:00.000Z',
        },
        status: 'succeeded',
        finishedAt: '2026-08-31T00:01:00.000Z',
        exitCode: 0,
      }),
    /EEXIST/u
  );
  assert.equal(fs.readFileSync(`${ledgerPath}.lock`, 'utf8'), 'owner');
  fs.rmSync(root, { recursive: true, force: true });
});

test('proof scope is durable and owner-bound', () => {
  const path = heavyProofLedgerPath({
    sliceId: 'HARNESS-V2-DURABLE',
    headSha: '1'.repeat(40),
    treeSha: '2'.repeat(40),
  });
  assert.match(path, /^\/Users\/arbenlila\/\.codex\/state\/interdomestik\//u);
  assert.equal(path.startsWith('/private/tmp/'), false);
});

test('reuses only exact verified lane identity', () => {
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

test('revalidates proof expiry on consumption', () => {
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
