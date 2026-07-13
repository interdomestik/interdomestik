import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import vercelApi, { createVercelApiFunction } from '../api/index.mjs';

const TOOL_ROOT = new URL('../', import.meta.url);

test('Vercel blocks the physical function path before routing private API paths', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', TOOL_ROOT), 'utf8'));
  assert.deepEqual(config.routes, [
    { src: '^/api/index(?:/.*)?$', status: 404 },
    { src: '^/api$', dest: '/api/index?__rec_root=1' },
    { src: '^/api/(.*)$', dest: '/api/index?__rec_path=$1' },
    { handle: 'filesystem' },
  ]);
  await assert.rejects(access(new URL('middleware.js', TOOL_ROOT)));
  await assert.rejects(access(new URL('api/[...path].mjs', TOOL_ROOT)));
});

test('Node function preserves the original Web Request for the private handler', async () => {
  const seen = [];
  const api = createVercelApiFunction({
    handler: async request => {
      seen.push(request);
      return new Response('private', { status: 200 });
    },
  });
  const request = new Request('https://reviewer.example.test/api/session?fresh=1', {
    headers: { cookie: 'review_portal_session=opaque' },
  });
  assert.equal((await api.fetch(request)).status, 200);
  assert.deepEqual(seen, [request]);
});

test('Node function restores path and query while preserving request security inputs', async () => {
  const seen = [];
  const api = createVercelApiFunction({
    handler: async request => {
      seen.push({
        url: request.url,
        method: request.method,
        body: await request.text(),
        cookie: request.headers.get('cookie'),
        origin: request.headers.get('origin'),
      });
      return new Response('private', { status: 200 });
    },
  });
  const request = new Request(
    'https://reviewer.example.test/api/index?__rec_path=receipts%2Frec_1&fresh=1',
    {
      method: 'POST',
      body: '{"decision":"approve"}',
      headers: {
        cookie: 'review_portal_session=opaque',
        origin: 'https://reviewer.example.test',
      },
    }
  );
  assert.equal((await api.fetch(request)).status, 200);
  assert.deepEqual(seen, [
    {
      url: 'https://reviewer.example.test/api/receipts/rec_1?fresh=1',
      method: 'POST',
      body: '{"decision":"approve"}',
      cookie: 'review_portal_session=opaque',
      origin: 'https://reviewer.example.test',
    },
  ]);
});

test('default Node function fails closed without named-account configuration', async () => {
  const before = process.env.REVIEW_PORTAL_ACCOUNTS_JSON;
  delete process.env.REVIEW_PORTAL_ACCOUNTS_JSON;
  try {
    const response = await vercelApi.fetch(
      new Request('https://reviewer.example.test/api/session')
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { code: 'service_unavailable' });
  } finally {
    if (before === undefined) delete process.env.REVIEW_PORTAL_ACCOUNTS_JSON;
    else process.env.REVIEW_PORTAL_ACCOUNTS_JSON = before;
  }
});
