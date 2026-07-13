import assert from 'node:assert/strict';
import test from 'node:test';

import middleware, { config, createMiddleware } from '../middleware.js';

test('middleware is explicitly Node-scoped to private API routes', () => {
  assert.deepEqual(config, { runtime: 'nodejs', matcher: '/api/:path*' });
});

test('middleware leaves public assets alone and delegates only API requests', async () => {
  assert.equal(typeof createMiddleware, 'function');
  const seen = [];
  const scoped = createMiddleware({
    handler: async request => {
      seen.push(new URL(request.url).pathname);
      return new Response('private', { status: 200 });
    },
  });
  assert.equal(await scoped(new Request('https://reviewer.example.test/')), undefined);
  assert.equal(
    (await scoped(new Request('https://reviewer.example.test/styles/base.css'))),
    undefined
  );
  assert.equal((await scoped(new Request('https://reviewer.example.test/api/session'))).status, 200);
  assert.deepEqual(seen, ['/api/session']);
});

test('default middleware fails closed without named-account configuration', async () => {
  const before = process.env.REVIEW_PORTAL_ACCOUNTS_JSON;
  delete process.env.REVIEW_PORTAL_ACCOUNTS_JSON;
  try {
    const response = await middleware(new Request('https://reviewer.example.test/api/session'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { code: 'service_unavailable' });
  } finally {
    if (before === undefined) delete process.env.REVIEW_PORTAL_ACCOUNTS_JSON;
    else process.env.REVIEW_PORTAL_ACCOUNTS_JSON = before;
  }
});
