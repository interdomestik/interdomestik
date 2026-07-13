import assert from 'node:assert/strict';
import test from 'node:test';

import { createConsoleServer } from '../server/app.mjs';

test('invalid private API paths retain no-store and nosniff response headers', async t => {
  const server = createConsoleServer();
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());

  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/${'a'.repeat(101)}`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
