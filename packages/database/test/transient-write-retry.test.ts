import assert from 'node:assert/strict';
import test from 'node:test';

import { withTransientDbWriteRetry } from '../src/seed-utils/transient-write-retry';

const transient = () => Object.assign(new Error('reset'), { code: 'ECONNRESET' });

function failingWrite(failures: Error[]) {
  let calls = 0;
  const run = async () => {
    const failure = failures[calls];
    calls += 1;
    if (failure) throw failure;
    return 'written';
  };
  return { run, calls: () => calls };
}

test('retries transient write failures until the write succeeds', async t => {
  t.mock.method(console, 'warn', () => undefined);
  const write = failingWrite([transient(), transient()]);

  assert.equal(await withTransientDbWriteRetry('row', write.run), 'written');
  assert.equal(write.calls(), 3);
});

test('rethrows a non-transient failure without retrying', async () => {
  const fatal = new Error('constraint');
  const write = failingWrite([fatal]);

  await assert.rejects(withTransientDbWriteRetry('row', write.run), fatal);
  assert.equal(write.calls(), 1);
});

test('gives up after three transient failures', async t => {
  t.mock.method(console, 'warn', () => undefined);
  const last = transient();
  const write = failingWrite([transient(), transient(), last]);

  await assert.rejects(withTransientDbWriteRetry('row', write.run), last);
  assert.equal(write.calls(), 3);
});
