import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createM4EmailMarker,
  M4_EMAIL_UNAVAILABLE_LINE as marker,
} from './db-access-m4-email-marker.mjs';
const termination = {
  code: 0,
  signal: null,
  forced: false,
  stdoutEnded: true,
  stderrEnded: true,
  outputFenceAcknowledged: true,
};
const line = Buffer.from(marker + '\n');

test('counts only exact complete stderr line, across every possible chunk boundary', async () => {
  for (let boundary = 0; boundary <= line.length; boundary++) {
    const reader = createM4EmailMarker();
    const waited = reader.waitForCount(1);
    reader.feed('stderr', line.subarray(0, boundary));
    reader.feed('stderr', line.subarray(boundary));
    assert.equal(await waited, 1);
    assert.equal(reader.finish(termination).emailUnavailableCalls, 1);
  }
});
test('stdout, prefix, suffix, CR and embedded text never substitute for the fixed line', () => {
  const reader = createM4EmailMarker();
  reader.feed('stdout', line);
  for (const value of ['prefix ' + marker, marker + ' suffix', marker + '\r', 'x' + marker + 'x'])
    reader.feed('stderr', Buffer.from(value + '\n'));
  assert.equal(reader.finish(termination).emailUnavailableCalls, 0);
});
test('complete duplicate markers remain counted in final EOF summary', async () => {
  const reader = createM4EmailMarker();
  reader.feed('stderr', line);
  assert.equal(await reader.waitForCount(1), 1);
  reader.feed('stderr', line);
  assert.equal(reader.finish(termination).emailUnavailableCalls, 2);
});
test('final summary refuses code, signal, forced kill and missing EOF independently', () => {
  for (const override of [
    { code: 1 },
    { signal: 'SIGKILL' },
    { forced: true },
    { stdoutEnded: false },
    { stderrEnded: false },
    { outputFenceAcknowledged: false },
  ]) {
    const reader = createM4EmailMarker();
    reader.feed('stderr', line);
    assert.throws(() => reader.finish({ ...termination, ...override }), /refused/);
    assert.throws(() => reader.count(), /refused/);
  }
});
test('unterminated marker is never accepted as a completed invocation', () => {
  const reader = createM4EmailMarker();
  reader.feed('stderr', Buffer.from(marker));
  assert.equal(reader.count(), 0);
  assert.throws(() => reader.finish(termination), /refused/);
});
test('combined output byte cap remains exactly one MiB and failure is sticky', () => {
  const reader = createM4EmailMarker();
  reader.feed('stdout', Buffer.alloc(512 * 1024));
  reader.feed('stderr', Buffer.alloc(512 * 1024, 10));
  assert.equal(reader.count(), 0);
  assert.throws(() => reader.feed('stdout', Buffer.from('x')), /refused/);
  assert.throws(() => reader.finish(termination), /refused/);
});
test('arbitrarily chunked unrelated lines use no retained log content', () => {
  const reader = createM4EmailMarker();
  for (let i = 0; i < 100; i++) reader.feed('stderr', Buffer.alloc(1000, 97));
  reader.feed('stderr', Buffer.from('\n'));
  reader.feed('stderr', line);
  assert.deepEqual(reader.finish(termination), {
    emailUnavailableCalls: 1,
    exitCode: 0,
    exitMode: 'explicit-after-output-fence',
    outputFenceAcknowledged: true,
    forcedTermination: false,
    stdoutEnded: true,
    stderrEnded: true,
  });
});
test('abort rejects pending wait and blocks successful finalization', async () => {
  const reader = createM4EmailMarker();
  const wait = reader.waitForCount(1);
  reader.reject();
  await assert.rejects(wait, /refused/);
  assert.throws(() => reader.finish(termination), /refused/);
});
test('post-EOF data and absent requested marker fail closed', async () => {
  const reader = createM4EmailMarker();
  reader.finish(termination);
  await assert.rejects(reader.waitForCount(1), /refused/);
  assert.throws(() => reader.feed('stderr', line), /refused/);
});
test('over-counted and invalid expected counts are refused', async () => {
  const reader = createM4EmailMarker();
  reader.feed('stderr', Buffer.concat([line, line]));
  for (const expected of [-1, 1.5, 1, NaN])
    await assert.rejects(reader.waitForCount(expected), /refused/);
});
