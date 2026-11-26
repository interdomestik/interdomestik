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
  observeInvocation,
  readInvocation,
  writeInvocation,
} from './verification-evidence/m4-dispatch.mjs';
import { verifyComposition } from './verification-evidence/m4.mjs';
import { M4_SCRIPT } from './verification-evidence/manifest.mjs';
import { checkReceipt } from './verification-evidence/receipt.mjs';
import { assertEvidence } from './verification-evidence/ticket.mjs';
import { harness, trusted } from './verify-machine-harness.mjs';
import { finalRecordPath, LANES } from './verify-machine-records.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

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

function stampFixture(t, f, scope) {
  const h = harness({
    marker: { ...trusted(), sha256: scope.markerSha256 },
    env: { INTERDOMESTIK_M4_DISPATCH_DIR: '/grant', INTERDOMESTIK_M4_QUEUE_SCOPE: '{}' },
  });
  t.after(h.cleanup);
  const grant = makeGrant(scope, f.job, approved.sha256, h.deps.cwd);
  const policy = scope.method === 'composed-trial' ? { ...approved, mode: 'trial' } : approved;
  let at = now;
  h.deps.now = () => new Date(at).toISOString();
  h.deps.verifyComposition = (_root, _env, _stage, lane) => {
    checkGrant(grant, f.job, policy, at);
    return { scope: grant.scope, runId: grant.runIds[lane] };
  };
  function run(command, lane, time) {
    at = time;
    h.deps.env.npm_lifecycle_event = lane === 'pr-verify' ? M4_SCRIPT : 'security:guard';
    return runVerifyMachine([command, lane], h.deps);
  }
  return { ...h, grant, run };
}

function observe(grant, lines, exit) {
  const observation = observeInvocation(grant);
  lines.forEach(observation.line);
  return observation.result(exit);
}

function stamps(t, f, scope) {
  const h = stampFixture(t, f, scope);
  assert.equal(h.run('begin', 'pr-verify', now), 0);
  assert.equal(h.run('begin', 'security-guard', now + 1), 0);
  assert.equal(h.run('stamp', 'security-guard', now + 9), 0);
  assert.equal(h.run('stamp', 'pr-verify', now + 10), 0);
  const { grant, directory } = h;
  const files = LANES.map(lane => {
    const file = finalRecordPath(directory, { lane, head: scope.head, runId: grant.runIds[lane] });
    return { file, record: JSON.parse(readFileSync(file)) };
  });
  return { ...h, files, outcome: observe(grant, h.output.log, 0) };
}

test('publication requires the exact pair captured after the observed invocation exit', t => {
  const f = evidenceFixture(t);
  const scope = verifyComposition('/root', f.dir, f.job, 'dispatch', 'gate', verifier(f));
  const observed = stamps(t, f, scope);
  const unrelated = stamps(t, f, scope);
  const { file, record } = observed.files[1];
  const capture = (outcome = observed.outcome) =>
    captureInvocation(observed.directory, observed.grant, outcome, f.signAs);
  assert.throws(() => capture({ ...observed.outcome, exit: 1 }), /m4-launch-exit/u);
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
  writeFileSync(file, JSON.stringify({ ...record, configuration: { node: 'changed after stamp' } }));
  assert.throws(capture, /m4-stamp-digest/u);
  writeFileSync(file, original);
  const lines = observed.output.log;
  for (const bad of [[], unrelated.output.log, lines.slice(0, -1), [...lines, lines.at(-1)]]) {
    assert.throws(() => capture(observe(observed.grant, bad, 0)), /m4-stamp-digest/u);
  }
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
  const { grant, directory: records, outcome } = stamps(t, f, trial);
  const directory = path.join(f.dir, 'trial-capture');
  writeInvocation(directory, captureInvocation(records, grant, outcome, f.signAs));
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
      return { grant: 'grant', outcome: { exit, stampRefusals: 0 } };
    },
    capture: (grant, outcome) => calls.push(`capture:${grant}:${outcome.exit}`),
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
  exit = 21;
  assert.equal(await dispatchM4(options), 21);
  assert.deepEqual(calls.splice(0), [
    'queue:dispatch',
    'receipt:dispatch',
    'composed',
    'queue:accept',
    'receipt:accept',
    'queue:accept',
  ]);
  collected = true;
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

test('a grant that expires at stamp triggers the full gate only on an eligible queue', async t => {
  const f = evidenceFixture(t);
  const deps = verifier(f);
  let at = now;
  let fullRuns = 0;
  deps.now = () => at;
  const options = {
    signal: new AbortController().signal,
    checkQueue() {},
    collect: stage => verifyComposition('/root', f.dir, f.job, stage, 'gate', deps),
    runComposed(scope) {
      const h = stampFixture(t, f, scope);
      assert.equal(h.run('begin', 'pr-verify', now), 0);
      assert.equal(h.run('begin', 'security-guard', now + 1), 0);
      assert.equal(h.run('stamp', 'security-guard', now + 9), 0);
      at = scope.expiresAt;
      const exit = h.run('stamp', 'pr-verify', at);
      assert.equal(exit, 1);
      assert.match(h.output.error.at(-1), /composed evidence was refused at stamp/u);
      return { grant: h.grant, outcome: observe(h.grant, h.output.log, exit) };
    },
    runFull() {
      fullRuns += 1;
      return 0;
    },
    capture: () => assert.fail('expired evidence cannot be captured'),
  };
  assert.equal(await dispatchM4(options), 0);
  assert.equal(fullRuns, 1);

  at = now;
  await assert.rejects(
    () =>
      dispatchM4({
        ...options,
        checkQueue(stage) {
          if (stage === 'accept') throw new Error('stale queue');
        },
      }),
    /stale queue/u
  );
  assert.equal(fullRuns, 1);
});
