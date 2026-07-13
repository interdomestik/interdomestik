import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import test from 'node:test';

import { createConsoleServer } from '../server/app.mjs';
import { hasValidMutationOrigin } from '../server/auth/origin.mjs';

function requestServer({ port, pathname, host, origin, method = 'GET', body }) {
  return new Promise((resolve, reject) => {
    const headers = origin ? { host, origin } : { host };
    const request = httpRequest(
      { hostname: '127.0.0.1', port, path: pathname, method, headers },
      response => {
        response.resume();
        response.once('end', () => resolve(response));
      }
    );
    request.once('error', reject);
    request.end(body);
  });
}

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

test('mutation origin follows an explicitly allowed loopback host', async t => {
  let requestUrl;
  const server = createConsoleServer({
    portalHandler: async request => {
      requestUrl = request.url;
      return new Response(null, { status: hasValidMutationOrigin(request) ? 204 : 403 });
    },
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const response = await requestServer({
    port,
    pathname: '/api/session/login',
    method: 'POST',
    host: `localhost:${port}`,
    origin: `http://localhost:${port}`,
    body: '{}',
  });

  assert.equal(response.statusCode, 204);
  assert.equal(requestUrl, `http://localhost:${port}/api`);
});

test('adapter rejects a non-loopback Host before calling the API handler', async t => {
  let called = false;
  const server = createConsoleServer({
    portalHandler: async () => {
      called = true;
      return new Response(null, { status: 204 });
    },
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const response = await requestServer({
    port,
    pathname: '/api/session',
    host: 'attacker.example',
  });

  assert.equal(response.statusCode, 404);
  assert.equal(called, false);
});

test('API root and query stay inside the private API handler', async t => {
  const seen = [];
  const server = createConsoleServer({
    portalHandler: async (_request, pathname) => {
      seen.push(pathname);
      return new Response(null, { status: 204 });
    },
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const response = await requestServer({
    port,
    pathname: '/api?probe=1',
    host: `127.0.0.1:${port}`,
  });

  assert.equal(response.statusCode, 204);
  assert.deepEqual(seen, ['/api']);
});
