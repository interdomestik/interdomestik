import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, deriveEvidenceIdentityKey, sha256 } from './slice-rehearse-canonical.mjs';
import { collect, githubReader, run } from './slice-rehearse-github-evidence-fixtures.mjs';
import {
  acquireHeavyProofExecutionLease,
  heavyProofLedgerPath,
  recordHeavyProofExecution,
} from './slice-rehearse-proof-ledger.mjs';
import { planInvalidatedProofs, runHeavyProofExecution } from './slice-rehearse-proof-plan.mjs';

test('later failed, cancelled or pending workflow vetoes older successful evidence', () => {
  for (const state of [
    { status: 'completed', conclusion: 'failure' },
    { status: 'completed', conclusion: 'cancelled' },
    { status: 'in_progress', conclusion: null },
    { status: 'queued', conclusion: null },
  ]) {
    const reader = githubReader({
      runs: [run(), run({ id: 78, updated_at: '2026-08-29T11:50:00.000Z', ...state })],
    });
    let jobs = 0;
    const result = collect({
      readGithub: endpoint => {
        assert.ok(!endpoint.includes('status=completed'));
        if (endpoint.includes('/jobs')) jobs += 1;
        return reader(endpoint);
      },
    });
    assert.deepEqual(result, {});
    assert.equal(jobs, 0);
  }
});

test('ambiguous or malformed newer run cannot silently preserve a prior success', () => {
  for (const newer of [
    run(),
    run({ id: 78, updated_at: null }),
    run({ id: 78, head_sha: 'f'.repeat(40) }),
  ]) {
    assert.deepEqual(collect({ readGithub: githubReader({ runs: [run(), newer] }) }), {});
  }
});

test('contradictory current lane decisions conservatively invalidate reuse in either order', () => {
  const identity = {
    headSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
    commandDigest: 'c'.repeat(64),
    workflowDigest: 'd'.repeat(64),
    substrateDigest: 'e'.repeat(64),
    writerMapDigest: 'f'.repeat(64),
  };
  const key = deriveEvidenceIdentityKey({ lane: 'pr-e2e', ...identity });
  const yes = { lane: 'pr-e2e', key, reusable: true, expiresAt: '2099-01-01T00:00:00.000Z' };
  for (const keyOrUnknown of [key, null]) {
    const no = { lane: 'pr-e2e', key: keyOrUnknown, reusable: false };
    for (const decisions of [
      [yes, no],
      [no, yes],
    ]) {
      assert.deepEqual(
        planInvalidatedProofs({
          requiredLanes: ['pr-e2e'],
          decisions,
          expectedByLane: { 'pr-e2e': identity },
        }),
        { reuse: [], run: [{ lane: 'pr-e2e', evidenceKey: key }] }
      );
    }
  }
});

function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'proof-failure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scope = { sliceId: 'PROOF-FAILURE', headSha: 'a'.repeat(40), treeSha: 'b'.repeat(40) };
  const execution = {
    lane: 'pr-e2e',
    evidenceKey: 'c'.repeat(64),
    runId: 'run-001',
    startedAt: new Date().toISOString(),
  };
  const report = {
    schemaVersion: 1,
    sliceId: scope.sliceId,
    repository: scope,
    authorityStops: [],
    evidence: {
      executionPlan: {
        run: [{ lane: execution.lane, evidenceKey: execution.evidenceKey }],
        reuse: [],
      },
    },
    reportSha256: null,
  };
  report.reportSha256 = sha256(canonicalJson(report));
  const ledgerPath = heavyProofLedgerPath(scope, root);
  const options = {
    ledgerPath,
    execution,
    report,
    verifyCandidate: () => true,
    verifyProofHost: () => true,
    verifyFinalHead: () => true,
    acquireLease: input => acquireHeavyProofExecutionLease({ ...input, ledgerRoot: root }),
    record: input => recordHeavyProofExecution({ ...input, ledgerRoot: root }),
  };
  return { root, scope, execution, ledgerPath, options };
}

test('throw, timeout and thenable outcomes persist unknown and retain the durable claim', t => {
  const { options, ledgerPath } = fixture(t);
  const result = runHeavyProofExecution({
    ...options,
    execute: () => {
      throw new Error('response lost');
    },
  });
  assert.equal(result.status, 'unknown');
  assert.equal(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).status, 'unknown');
  assert.equal(fs.existsSync(`${ledgerPath}.run.lock`), true);
  assert.throws(
    () =>
      runHeavyProofExecution({
        ...options,
        execution: { ...options.execution, runId: 'run-002' },
        execute: () => assert.fail('unknown work cannot rerun'),
      }),
    /EEXIST/u
  );
});

test('pre-dispatch drift records cancellation and releases the claim only after persistence', t => {
  for (const verifier of ['verifyCandidate', 'verifyFinalHead']) {
    for (const throws of [false, true]) {
      const { options, ledgerPath } = fixture(t);
      let leased = false;
      let calls = 0;
      const result = runHeavyProofExecution({
        ...options,
        [verifier]: () => {
          if (leased && throws) throw new Error('evidence changed');
          return !leased;
        },
        acquireLease: input => {
          const release = options.acquireLease(input);
          leased = true;
          return release;
        },
        execute: () => {
          calls += 1;
          return { status: 0 };
        },
      });
      assert.equal(calls, 0);
      assert.equal(result.status, 'cancelled');
      assert.equal(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).status, 'cancelled');
      assert.equal(fs.existsSync(`${ledgerPath}.run.lock`), false);
      assert.equal(
        runHeavyProofExecution({
          ...options,
          execution: { ...options.execution, runId: 'fresh-evidence' },
          execute: () => ({ status: 0 }),
        }).status,
        'succeeded'
      );
    }
  }
});

test('durable receipt failure retains the claim before and after command dispatch', t => {
  for (const cancelled of [false, true]) {
    const { options, ledgerPath } = fixture(t);
    let checks = 0;
    assert.throws(
      () =>
        runHeavyProofExecution({
          ...options,
          verifyFinalHead: () => !cancelled || ++checks === 1,
          execute: () => ({ status: 0 }),
          record: () => {
            throw new Error('disk full');
          },
        }),
      /disk full/u
    );
    assert.equal(fs.existsSync(`${ledgerPath}.run.lock`), true);
  }
});

test('unreconciled signals, timeouts and asynchronous results stay unknown', t => {
  const { options } = fixture(t);
  for (const [result, expected] of [
    [{ status: null, signal: 'SIGINT' }, 'unknown'],
    [{ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } }, 'unknown'],
    [{ then() {} }, 'unknown'],
  ]) {
    const records = [];
    let preserve;
    const actual = runHeavyProofExecution({
      ...options,
      execute: () => result,
      acquireLease: () => value => {
        preserve = value;
      },
      record: value => records.push(value),
    });
    assert.equal(actual.status, expected);
    assert.equal(records[0].status, expected);
    assert.equal(preserve, expected === 'unknown');
  }
});

test('lease persistence failure prevents command dispatch', t => {
  const { options } = fixture(t);
  assert.throws(
    () =>
      runHeavyProofExecution({
        ...options,
        acquireLease: () => {
          throw new Error('cannot persist');
        },
        execute: () => assert.fail('no effect before durable claim'),
      }),
    /cannot persist/u
  );
});

test('current run uses provider run identity, not the update time of an older rerun', () => {
  const old = run({ id: 76, run_attempt: 2, updated_at: '2026-08-29T11:59:00.000Z' });
  const failed = run({ conclusion: 'failure' });
  assert.deepEqual(collect({ readGithub: githubReader({ runs: [old, failed] }) }), {});
  const stale = run({ id: 76, updated_at: '2026-08-25T00:00:00.000Z' });
  assert.equal(
    collect({ readGithub: githubReader({ runs: [stale, run()] }) })['pr-e2e'][0].runId,
    77
  );
});

test('known failed attempts consume the existing three-retry ceiling', t => {
  const { options, ledgerPath } = fixture(t);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(
      runHeavyProofExecution({
        ...options,
        execution: { ...options.execution, runId: `bounded-${attempt}` },
        execute: () => ({ status: 1 }),
      }).status,
      'failed'
    );
  }
  assert.equal(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').length, 4);
  assert.throws(
    () =>
      options.acquireLease({
        ledgerPath,
        scope: { sliceId: options.report.sliceId, ...options.report.repository },
        execution: { ...options.execution, runId: 'changed-key', evidenceKey: 'd'.repeat(64) },
      }),
    /retry budget exhausted/u
  );
  assert.throws(
    () =>
      runHeavyProofExecution({
        ...options,
        execution: { ...options.execution, runId: 'bounded-4' },
        execute: () => assert.fail('budget exhaustion must hold'),
      }),
    /retry budget exhausted/u
  );
});

test('changed evidence key cannot bypass an already successful final-head proof', t => {
  const { root, scope, execution, ledgerPath } = fixture(t);
  recordHeavyProofExecution({
    ledgerRoot: root,
    ledgerPath,
    scope,
    execution,
    status: 'succeeded',
    finishedAt: new Date().toISOString(),
    exitCode: 0,
  });
  assert.throws(
    () =>
      acquireHeavyProofExecutionLease({
        ledgerRoot: root,
        ledgerPath,
        scope,
        execution: { ...execution, runId: 'different-key', evidenceKey: 'f'.repeat(64) },
      }),
    /already succeeded/u
  );
});
