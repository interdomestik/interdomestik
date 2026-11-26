import assert from 'node:assert/strict';
import test from 'node:test';
import { approved, evidenceFixture, now } from './verification-evidence-test-fixture.mjs';
import { observe, stampFixture, verifier } from './verification-evidence-dispatch.test-support.mjs';
import { checkGrant, dispatchM4, makeGrant } from './verification-evidence/m4-dispatch.mjs';
import { verifyComposition } from './verification-evidence/m4.mjs';

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
  // Restore the receipt invalidated by the stale-at-accept case.
  collected = true;
  afterLaunch = () => abort.abort();
  await assert.rejects(() => dispatchM4(options), { name: 'AbortError' });
  assert.deepEqual(calls, ['queue:dispatch', 'receipt:dispatch', 'composed']);
});

test('a grant that expires at begin records the refusal and runs full verification once', async t => {
  const f = evidenceFixture(t);
  const deps = verifier(f);
  let at = now;
  let fullRuns = 0;
  let acceptChecks = 0;
  let recollectionRefusal;
  let refusalLine;
  let output;
  deps.now = () => at;

  const exit = await dispatchM4({
    signal: new AbortController().signal,
    checkQueue(stage) {
      if (stage === 'accept') acceptChecks += 1;
    },
    collect(stage) {
      try {
        return verifyComposition('/root', f.dir, f.job, stage, 'gate', deps);
      } catch (error) {
        recollectionRefusal = error.message;
        throw error;
      }
    },
    runComposed(scope) {
      const h = stampFixture(t, f, scope);
      at = scope.expiresAt;
      const beginExit = h.run('begin', 'pr-verify', at);
      assert.equal(beginExit, 1);
      assert.match(h.output.error.at(-1), /composed evidence was refused at begin/u);
      output = h.output.log;
      refusalLine = `M4-STAMP-REFUSED lane=pr-verify run=${h.grant.runIds['pr-verify']}`;
      return { grant: h.grant, outcome: observe(h.grant, output, beginExit) };
    },
    runFull() {
      fullRuns += 1;
      return 0;
    },
    capture: () => assert.fail('expired evidence cannot be captured'),
  });

  assert.equal(recollectionRefusal, 'ticket-expired');
  assert.deepEqual({ exit, fullRuns, acceptChecks }, { exit: 0, fullRuns: 1, acceptChecks: 2 });
  assert.deepEqual(output, [refusalLine]);
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
