import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { observeM4ChildLifecycle } from './db-access-m4-child-lifecycle.mjs';
import { createM4EmailMarker } from './db-access-m4-email-marker.mjs';
function fixture(pid = 123) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return { child, lifecycle: observeM4ChildLifecycle(child) };
}
test('actual exit and both EOF settle without aggregate close', async () => {
  const { child, lifecycle } = fixture(),
    result = lifecycle.waitForExitAndEOF();
  child.emit('exit', 0, null);
  child.stdout.emit('end');
  child.stderr.emit('end');
  assert.deepEqual(await result, { code: 0, signal: null, stdoutEnded: true, stderrEnded: true });
});
test('EOF may precede exit but never substitutes for it', async () => {
  const { child, lifecycle } = fixture();
  let resolved = false;
  const result = lifecycle.waitForExitAndEOF().then(value => {
    resolved = true;
    return value;
  });
  child.stdout.emit('end');
  child.stderr.emit('end');
  await Promise.resolve();
  assert.equal(resolved, false);
  child.emit('exit', 0, null);
  assert.equal((await result).code, 0);
});
for (const missing of ['stdout', 'stderr', 'exit'])
  test('fixed deadline rejects missing ' + missing, async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const { child, lifecycle } = fixture();
    const rejected = assert.rejects(lifecycle.waitForExitAndEOF(), /lifecycle refused/);
    if (missing !== 'stdout') child.stdout.emit('end');
    if (missing !== 'stderr') child.stderr.emit('end');
    if (missing !== 'exit') child.emit('exit', 0, null);
    child.emit('close', 0, null); // Aggregate close cannot replace missing required events.
    context.mock.timers.tick(5000);
    await rejected;
  });
test('spawn error without PID resolves failure cleanup, never lifecycle success', async () => {
  const { child, lifecycle } = fixture(undefined);
  child.pid = undefined;
  child.emit('error', Error('synthetic spawn error'));
  assert.deepEqual(await lifecycle.waitForExit(), { code: null, signal: null, spawnFailed: true });
  child.stdout.emit('end');
  child.stderr.emit('end');
  await assert.rejects(lifecycle.waitForExitAndEOF(), /lifecycle refused/);
});
test('error with live PID cannot fabricate termination for failure cleanup', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { child, lifecycle } = fixture();
  const rejected = assert.rejects(lifecycle.waitForExit(), /lifecycle refused/);
  child.emit('error', Error('synthetic process error'));
  context.mock.timers.tick(5000);
  await rejected;
});
test('nonzero exit and signal remain rejected by the unchanged final marker checks', async () => {
  for (const [code, signal] of [
    [7, null],
    [null, 'SIGTERM'],
  ]) {
    const { child, lifecycle } = fixture(),
      result = lifecycle.waitForExitAndEOF();
    child.emit('exit', code, signal);
    child.stdout.emit('end');
    child.stderr.emit('end');
    const marker = createM4EmailMarker();
    const termination = await result;
    assert.throws(
      () =>
        marker.finish({
          ...termination,
          forced: false,
          outputFenceAcknowledged: true,
        }),
      /observation refused/
    );
  }
});
test('exit and EOF never replace the mandatory output fence', async () => {
  const { child, lifecycle } = fixture(),
    result = lifecycle.waitForExitAndEOF();
  child.emit('exit', 0, null);
  child.stdout.emit('end');
  child.stderr.emit('end');
  const termination = await result;
  assert.throws(
    () =>
      createM4EmailMarker().finish({
        ...termination,
        forced: false,
        outputFenceAcknowledged: false,
      }),
    /observation refused/
  );
});
