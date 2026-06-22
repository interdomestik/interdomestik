import assert from 'node:assert/strict';
import test from 'node:test';

import { getPaddleResource } from './paddle';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_PADDLE_KEY = process.env.PADDLE_API_KEY;
const ORIGINAL_PADDLE_BASE = process.env.PADDLE_API_BASE;

function restoreEnv() {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_PADDLE_KEY === undefined) delete process.env.PADDLE_API_KEY;
  else process.env.PADDLE_API_KEY = ORIGINAL_PADDLE_KEY;
  if (ORIGINAL_PADDLE_BASE === undefined) delete process.env.PADDLE_API_BASE;
  else process.env.PADDLE_API_BASE = ORIGINAL_PADDLE_BASE;
}

test('getPaddleResource rejects unsafe Paddle API base URLs before fetch', async () => {
  process.env.PADDLE_API_KEY = 'test-key';
  process.env.PADDLE_API_BASE = 'http://127.0.0.1:3000';
  globalThis.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  try {
    const result = await getPaddleResource({ resource: 'customers', id: 'ctm_123' });
    assert.match(result.content[0].text, /Paddle API base URL is not allowed/i);
  } finally {
    restoreEnv();
  }
});

test('getPaddleResource keeps resource-controlled paths on the Paddle origin', async () => {
  process.env.PADDLE_API_KEY = 'test-key';
  delete process.env.PADDLE_API_BASE;
  let requestedUrl = '';
  globalThis.fetch = async input => {
    if (typeof input === 'string') requestedUrl = input;
    else if (input instanceof URL) requestedUrl = input.href;
    else if (input instanceof Request) requestedUrl = input.url;
    else throw new TypeError('Unexpected fetch input');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await getPaddleResource({
      resource: '//attacker.example' as Parameters<typeof getPaddleResource>[0]['resource'],
      id: 'ctm_123',
    });
    assert.equal(new URL(requestedUrl).origin, 'https://api.paddle.com');
    assert.equal(new URL(requestedUrl).pathname, '/%2F%2Fattacker.example/ctm_123');
  } finally {
    restoreEnv();
  }
});
