import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createConsoleServer, resolvePublicFile } from '../server/app.mjs';
import { parsePort, startConsoleServer } from '../server/start.mjs';

const publicRoot = await makePublicRoot();
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self'";

async function makePublicRoot() {
  const root = await mkdtemp(join(tmpdir(), 'review-console-'));
  const fixtures = {
    'index.html': '<!doctype html><title>Console</title>',
    'app.mjs': 'export const app = true;',
    'app.js': 'export const app = true;',
    'styles.css': 'body{}',
    'fixture.json': '{}',
    'icon.png': 'png',
    'icon.webp': 'webp',
    'font.woff2': 'font',
    'secret.txt': 'secret',
  };
  await Promise.all(
    Object.entries(fixtures).map(([file, content]) => writeFile(join(root, file), content))
  );
  return root;
}

async function startServer(t) {
  const server = createConsoleServer({ publicRoot });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  assert.equal(server.address().address, '127.0.0.1');
  return `http://127.0.0.1:${server.address().port}`;
}

test('GET and HEAD serve the shell with every security header', async t => {
  const origin = await startServer(t);
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${origin}/`, { method });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('content-security-policy'), CSP);
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('rejects non-read methods', async t => {
  const response = await fetch(`${await startServer(t)}/`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test('returns every allowlisted MIME type and rejects unsupported extensions', async t => {
  const origin = await startServer(t);
  const cases = [
    ['/index.html', 'text/html'],
    ['/app.mjs', 'text/javascript'],
    ['/app.js', 'text/javascript'],
    ['/styles.css', 'text/css'],
    ['/fixture.json', 'application/json'],
    ['/icon.png', 'image/png'],
    ['/icon.webp', 'image/webp'],
    ['/font.woff2', 'font/woff2'],
  ];
  for (const [pathname, mime] of cases) {
    assert.match((await fetch(origin + pathname)).headers.get('content-type'), new RegExp(mime));
  }
  const response = await fetch(`${origin}/secret.txt`);
  assert.equal(response.status, 415);
  assert.match(response.headers.get('content-type'), /text\/plain/);
});

test('returns 404 without reflecting the requested path', async t => {
  const response = await fetch(`${await startServer(t)}/missing.js`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /missing\.js/);
});

test('rejects malformed encoding and paths outside the public root', () => {
  assert.equal(resolvePublicFile('/%E0%A4%A', publicRoot).code, 400);
  assert.equal(resolvePublicFile('/..%2F..%2Fpackage.json', publicRoot).code, 403);
  assert.equal(resolvePublicFile('/nested/../../../package.json', publicRoot).code, 403);
});

test('validates PORT and starts on loopback only', async t => {
  assert.equal(parsePort(undefined), 4177);
  assert.equal(parsePort('5123'), 5123);
  for (const value of ['0', '1023', '65536', 'abc']) assert.throws(() => parsePort(value));
  const server = await startConsoleServer({ port: 0 });
  t.after(() => server.close());
  assert.equal(server.address().address, '127.0.0.1');
});

test('serves every external shell reference from the real public root', async t => {
  const server = await startConsoleServer({ port: 0 });
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const references = [
    '/styles/tokens.css',
    '/styles/base.css',
    '/styles/layout.css',
    '/styles/components.css',
    '/styles/responsive.css',
    '/src/app.mjs',
  ];
  for (const pathname of references) assert.equal((await fetch(origin + pathname)).status, 200);
});

test('delegates API requests to the shared Fetch handler', async t => {
  const server = createConsoleServer({
    publicRoot,
    portalHandler: async (request, pathname) =>
      new Response(
        JSON.stringify({ method: request.method, body: await request.json(), pathname, url: request.url }),
        { status: 201, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }
      ),
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'attacker.example', origin: 'http://127.0.0.1' },
    body: JSON.stringify({ ok: true }),
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    method: 'POST', body: { ok: true }, pathname: '/api/echo',
    url: `http://127.0.0.1:${server.address().port}/api`,
  });
});
