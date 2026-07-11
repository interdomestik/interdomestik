import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitCurrent } from '../public/src/app/current-async.mjs';

test('drops a deferred completion after its route token becomes stale', async () => {
  let release;
  let current = true;
  const pending = new Promise(resolve => (release = resolve));
  const result = awaitCurrent(pending, () => current);
  current = false;
  release('late value');
  assert.deepEqual(await result, { ok: false, code: 'stale' });
});

test('returns a deferred completion while its route token remains current', async () => {
  assert.deepEqual(await awaitCurrent(Promise.resolve('value'), () => true), {
    ok: true,
    value: 'value',
  });
});
