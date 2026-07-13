import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionController } from '../public/src/app/submission-controller.mjs';
import { completeDecision } from './validation-fixtures.mjs';
import { state, submissionDeps } from './submission-controller-fixtures.mjs';

test('opens the directory picker synchronously before submit returns a promise', async () => {
  const events = [];
  const pending = createSubmissionController(submissionDeps(events)).submit(state, true);
  assert.equal(events[0][0], 'picker');
  assert.equal(events.filter(event => event[0] === 'picker').length, 1);
  await pending;
});

test('stores then writes canonical receipt before opening the inbox', async () => {
  const events = [];
  await createSubmissionController(
    submissionDeps(events, { authorityDisclaimer: 'Advisory evidence only.' })
  ).submit(state, true);
  assert.deepEqual(
    events.map(event => event[0]),
    ['picker', 'build', 'store', 'write', 'inbox']
  );
  assert.equal(events[1][1].authorityDisclaimer, 'Advisory evidence only.');
  assert.deepEqual(events[1][1].structuredResponses, { item: {} });
  assert.equal(events[2][1], events[3][1]);
});

test('invalid forms perform no picker, build, store, write, or destination action', async () => {
  const events = [];
  const controller = createSubmissionController(submissionDeps(events));
  assert.equal((await controller.submit(state, false)).code, 'validation_failed');
  assert.equal(
    (await controller.submit({ decisions: { item: { ...completeDecision(), reason: '' } } }, true))
      .code,
    'validation_failed'
  );
  assert.deepEqual(events, []);
});

for (const code of ['cancelled', 'permission_failed', 'unsupported']) {
  test(`${code} still stores the receipt and opens receipt recovery`, async () => {
    const events = [];
    const deps = submissionDeps(events);
    deps.directoryWriter.requestDirectory = () => (
      events.push(['picker']),
      Promise.resolve({ ok: false, code })
    );
    await createSubmissionController(deps).submit(state, true);
    assert.deepEqual(
      events.map(event => event[0]),
      ['picker', 'build', 'store', 'receipt']
    );
  });
}

test('write failure keeps the stored receipt and opens receipt recovery', async () => {
  const events = [];
  const deps = submissionDeps(events);
  deps.directoryWriter.save = async () => (
    events.push(['write']),
    { ok: false, code: 'write_failed' }
  );
  await createSubmissionController(deps).submit(state, true);
  assert.deepEqual(
    events.map(event => event[0]),
    ['picker', 'build', 'store', 'write', 'receipt']
  );
});

for (const failurePoint of ['build', 'store']) {
  test(`${failurePoint} failure handles a concurrently rejecting picker without navigation`, async () => {
    const events = [];
    const deps = submissionDeps(events);
    deps.directoryWriter.requestDirectory = () => (
      events.push(['picker']),
      Promise.reject(new DOMException('denied', 'NotAllowedError'))
    );
    if (failurePoint === 'build')
      deps.buildReceipt = async () => {
        throw new Error('build');
      };
    else deps.receiptStore.save = async () => ({ ok: false, code: 'unavailable' });
    assert.equal((await createSubmissionController(deps).submit(state, true)).code, 'unavailable');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(
      events.some(event => ['write', 'inbox', 'receipt'].includes(event[0])),
      false
    );
  });
}

test('expired session during receipt build clears stale authenticated access', async () => {
  const events = [];
  const deps = submissionDeps(events, {
    buildReceipt: async () =>
      Promise.reject(Object.assign(new Error('expired'), { code: 'session_expired' })),
    onSessionExpired: () => events.push(['expired']),
  });

  const result = await createSubmissionController(deps).submit(state, true);

  assert.equal(result.code, 'session_expired');
  assert.equal(
    events.some(event => event[0] === 'expired'),
    true
  );
  assert.equal(
    events.some(event => ['inbox', 'receipt'].includes(event[0])),
    false
  );
});

test('duplicate pending submit shares one picker and one store', async () => {
  const events = [];
  let release;
  const pending = new Promise(resolve => (release = resolve));
  const deps = submissionDeps(events);
  deps.receiptStore.save = async receipt => (
    events.push(['store', receipt]),
    await pending,
    { ok: true, value: receipt }
  );
  const controller = createSubmissionController(deps);
  const first = controller.submit(state, true);
  assert.deepEqual(await controller.submit(state, true), { ok: false, code: 'submitting' });
  release();
  await first;
  assert.equal(events.filter(event => event[0] === 'picker').length, 1);
  assert.equal(events.filter(event => event[0] === 'store').length, 1);
});
