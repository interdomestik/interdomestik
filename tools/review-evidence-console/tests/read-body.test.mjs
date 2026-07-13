import assert from 'node:assert/strict';
import test from 'node:test';

import { readJsonBody } from '../server/http/read-body.mjs';

test('stops reading an undeclared body as soon as the byte limit is exceeded', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode('12345'));
      if (pulls === 100) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://reviewer.example.test/api/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    duplex: 'half',
  });
  assert.deepEqual(await readJsonBody(request, 8), {
    ok: false,
    status: 413,
    code: 'body_too_large',
  });
  assert.equal(cancelled, true);
  assert.ok(pulls <= 3, `expected bounded reads, received ${pulls}`);
});
