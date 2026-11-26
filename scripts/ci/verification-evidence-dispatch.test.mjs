import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { approved, evidenceFixture, lockfile, now } from './verification-evidence-test-fixture.mjs';
import {
  captureInvocation,
  checkGrant,
  checkMacJob,
  dispatchM4,
  makeGrant,
  readInvocation,
  writeInvocation,
} from './verification-evidence/m4-dispatch.mjs';
import { verifyComposition } from './verification-evidence/m4.mjs';
import { checkReceipt } from './verification-evidence/receipt.mjs';
import { assertEvidence } from './verification-evidence/ticket.mjs';
import { finalRecordPath } from './verify-machine-records.mjs';

function verifier(...jobs) {
  return {
    approval: () => approved,
    now: () => now,
    checkManifest() {},
    checkGitInputs: () => ({ lockfileSha256: lockfile }),
    authority: (_stage, _approved, _root, queued) => {
      const f = jobs.find(job => job.current.attempt === queued.attempt);
      assertEvidence(f?.job.ticketId === queued.ticketId, 'queue-ticket-changed');
      return {
        identity: f.current,
        macJobId: '0-0000000000000000001-1234',
        m5: {
          dispatcherExit: 0,
          runId: f.receipt.runId,
          receiptSha256: f.verify().receiptSha256,
        },
      };
    },
    checkReceipt: (directory, approval, at, current, _authenticate, job) =>
      checkReceipt(directory, approval, at, current, jobs[0].authenticate, job),
  };
}

test('collection, dispatch and acceptance reject another eligible job sharing the head and base', t => {
  const first = evidenceFixture(t);
  const second = evidenceFixture(t, {
    keys: first.keys,
    current: {
      ...first.current,
      subject: 'pr:2160',
      attempt: '4d26e486-6604-4343-99f8-101455b496d9',
    },
  });
  const duplicate = evidenceFixture(t, { keys: first.keys, current: first.current });
  const deps = verifier(first, second);
  for (const stage of ['collect', 'dispatch', 'accept', 'finish']) {
    for (const [ours, other] of [
      [first, second],
      [second, first],
    ]) {
      const scope = verifyComposition('/root', ours.dir, ours.job, stage, 'gate', deps);
      assert.equal(scope.ticketId, ours.job.ticketId);
      assert.equal(scope.head, other.current.head);
      assert.equal(scope.base, other.current.main);
      assert.throws(
        () => verifyComposition('/root', other.dir, ours.job, stage, 'gate', deps),
        /queued-ticket/u
      );
      const grant = makeGrant(scope, ours.job, approved.sha256, '/worker');
      assert.equal(checkGrant(grant, ours.job, approved, now), grant);
      assert.throws(() => checkGrant(grant, other.job, approved, now), /m4-grant/u);
    }
  }
  assert.throws(
    () => verifyComposition('/root', duplicate.dir, first.job, 'dispatch', 'gate', deps),
    /queued-ticket/u
  );
  assert.throws(
    () => verifyComposition('/root', duplicate.dir, duplicate.job, 'dispatch', 'gate', deps),
    /queue-ticket-changed/u
  );
  for (const job of [undefined, {}, { ...first.job, ticketId: '' }]) {
    assert.throws(
      () => verifyComposition('/root', first.dir, job, 'dispatch', 'gate', deps),
      /queued-job/u
    );
  }
});

test('a signed M5 receipt requires the matching successful dispatcher finish', t => {
  const f = evidenceFixture(t);
  const deps = verifier(f);
  const authority = deps.authority;
  for (const change of [
    null,
    { dispatcherExit: 1 },
    { runId: f.job.ticketId },
    { receiptSha256: '' },
  ]) {
    deps.authority = (...args) => {
      const snapshot = authority(...args);
      return { ...snapshot, m5: change && { ...snapshot.m5, ...change } };
    };
    assert.throws(
      () => verifyComposition('/root', f.dir, f.job, 'dispatch', 'gate', deps),
      /m5-dispatch-finish/u
    );
  }
});

test('publication requires a successful terminal event for the bound M4 dispatcher job', () => {
  const macJobId = '0-0000000000000000001-1234';
  checkMacJob('finish', { macJobId, dispatcherExit: 0 });
  for (const bad of [{}, { macJobId: '1-0000000000000000001-1234', dispatcherExit: 0 }]) {
    assert.throws(() => checkMacJob('finish', bad), /mac-job-identity/u);
  }
  for (const dispatcherExit of [undefined, '0', 1, 143]) {
    assert.throws(() => checkMacJob('finish', { macJobId, dispatcherExit }), /mac-job-finish/u);
  }
});

function stamps(f, scope) {
  const grant = makeGrant(scope, f.job, approved.sha256, '/worker');
  const mode = scope.method === 'composed' ? 'GATE-EVIDENCE' : 'TRIAL-EVIDENCE';
  return {
    grant,
    files: ['pr-verify', 'security-guard'].map((lane, index) => {
      const record = {
        lane,
        mode,
        machineRole: 'm4',
        result: 'passed',
        head: scope.head,
        markerSha256: scope.markerSha256,
        composition: grant.scope,
        runId: grant.runIds[lane],
        startedAt: new Date(now + index).toISOString(),
        finishedAt: new Date(now + 10 - index).toISOString(),
      };
      const file = finalRecordPath(f.dir, record);
      writeFileSync(file, JSON.stringify(record));
      return { file, record };
    }),
  };
}

test('publication requires the exact pair captured after the observed invocation exit', t => {
  const f = evidenceFixture(t);
  const scope = verifyComposition('/root', f.dir, f.job, 'dispatch', 'gate', verifier(f));
  const observed = stamps(f, scope);
  const unrelated = stamps(f, scope);
  const { file, record } = observed.files[1];
  const capture = () => captureInvocation(f.dir, observed.grant, 0, f.signAs);
  assert.throws(() => captureInvocation(f.dir, observed.grant, 1, f.signAs), /m4-launch-exit/u);
  const original = readFileSync(file);
  rmSync(file);
  assert.throws(capture, /ENOENT/u);
  for (const bad of [
    unrelated.files[1].record,
    {},
    { ...record, mode: 'PRE-CHECK' },
    { ...record, mode: 'TRIAL-EVIDENCE' },
    { ...record, composition: unrelated.grant.scope },
    { ...record, result: 'failed' },
  ]) {
    writeFileSync(file, JSON.stringify(bad));
    assert.throws(capture, /m4-record/u);
  }
  writeFileSync(file, JSON.stringify({ ...record, finishedAt: new Date(now + 11).toISOString() }));
  assert.throws(capture, /m4-run-pair/u);
  writeFileSync(file, original);
  const directory = path.join(f.dir, 'captured');
  writeInvocation(directory, capture());
  const read = () => readInvocation(directory, scope, f.job, approved, now, f.authenticate);
  const expected = read();
  assert.throws(
    () =>
      readInvocation(
        directory,
        { ...scope, macJobId: 'other-job' },
        f.job,
        approved,
        now,
        f.authenticate
      ),
    /m4-capture-scope/u
  );
  assert.deepEqual(
    expected.value.records.map(item => item.runId),
    [observed.grant.runIds['pr-verify'], observed.grant.runIds['security-guard']]
  );
  const published = path.join(f.dir, 'published');
  writeInvocation(published, expected);
  assert.deepEqual(
    readInvocation(published, scope, f.job, approved, now, f.authenticate).bytes,
    expected.bytes
  );
  const security = path.join(directory, path.basename(file));
  writeFileSync(
    security,
    JSON.stringify({ ...record, finishedAt: new Date(now + 8).toISOString() })
  );
  assert.throws(read, /m4-capture-pair/u);
  writeFileSync(security, original);
  const index = path.join(directory, 'accepted.json');
  rmSync(index);
  assert.throws(read, /ENOENT/u);
  for (const bad of ['', '{', '{}']) {
    writeFileSync(index, bad);
    writeFileSync(path.join(directory, 'accepted.sig'), f.signAs(bad, 'm4'));
    assert.throws(read, /artifact-file|m4-capture|JSON/u);
  }
  writeFileSync(index, JSON.stringify({ ...expected.value, records: [] }));
  assert.throws(read, /signature mismatch/u);
});

test('trial captures can be retained but never accepted for publication', t => {
  const f = evidenceFixture(t);
  const scope = verifyComposition('/root', f.dir, f.job, 'dispatch', 'gate', verifier(f));
  const trial = { ...scope, method: 'composed-trial' };
  const { grant } = stamps(f, trial);
  const directory = path.join(f.dir, 'trial-capture');
  writeInvocation(directory, captureInvocation(f.dir, grant, 0, f.signAs));
  assert.throws(
    () =>
      readInvocation(directory, trial, f.job, { ...approved, mode: 'trial' }, now, f.authenticate),
    /m4-capture-scope/u
  );
});

test('locked selection falls back for unusable evidence and preserves real composed failures', async () => {
  const calls = [];
  const abort = new AbortController();
  let collected = true;
  let exit = 0;
  let afterLaunch = () => {};
  const options = {
    signal: abort.signal,
    checkQueue: stage => calls.push(`queue:${stage}`),
    collect: stage => {
      calls.push(`receipt:${stage}`);
      if (!collected) throw new Error('unusable');
      return { evidence: 'verified' };
    },
    runFull: () => {
      calls.push('full');
      return 0;
    },
    runComposed: () => {
      calls.push('composed');
      afterLaunch();
      return { exit, grant: 'grant' };
    },
    capture: (grant, status) => calls.push(`capture:${grant}:${status}`),
  };
  assert.equal(await dispatchM4(options), 0);
  assert.deepEqual(calls.splice(0), [
    'queue:dispatch',
    'receipt:dispatch',
    'composed',
    'queue:accept',
    'receipt:accept',
    'capture:grant:0',
  ]);
  collected = false;
  assert.equal(await dispatchM4(options), 0);
  assert.deepEqual(calls.splice(0), [
    'queue:dispatch',
    'receipt:dispatch',
    'queue:dispatch',
    'full',
  ]);
  collected = true;
  afterLaunch = () => {
    collected = false;
  };
  assert.equal(await dispatchM4(options), 0);
  assert.deepEqual(calls.splice(0), [
    'queue:dispatch',
    'receipt:dispatch',
    'composed',
    'queue:accept',
    'receipt:accept',
    'queue:accept',
    'full',
  ]);
  collected = true;
  afterLaunch = () => {};
  exit = 21;
  assert.equal(await dispatchM4(options), 21);
  assert.deepEqual(calls.splice(0), [
    'queue:dispatch',
    'receipt:dispatch',
    'composed',
    'queue:accept',
    'receipt:accept',
  ]);
  for (const refused of ['dispatch', 'accept']) {
    await assert.rejects(
      () =>
        dispatchM4({
          ...options,
          checkQueue(stage) {
            if (stage === refused) throw new Error('stale queue');
          },
        }),
      /stale queue/u
    );
    assert.ok(calls.splice(0).every(call => !/capture|full/u.test(call)));
  }
  afterLaunch = () => abort.abort();
  await assert.rejects(() => dispatchM4(options), { name: 'AbortError' });
  assert.deepEqual(calls, ['queue:dispatch', 'receipt:dispatch', 'composed']);
});
