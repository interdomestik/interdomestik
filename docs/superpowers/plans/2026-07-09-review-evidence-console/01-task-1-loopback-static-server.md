# Task 1: Loopback-Only Static Server

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 1: Data, Validation, Persistence, And Server

### Task 1: Add The Loopback-Only Static Server

**Files:**

- Create: `tools/review-evidence-console/server/app.mjs`
- Create: `tools/review-evidence-console/server/start.mjs`
- Create: `tools/review-evidence-console/public/index.html`
- Test: `tools/review-evidence-console/tests/server.test.mjs`

- [ ] **Step 1: Write six failing server-contract tests**

Create a temporary public root containing `index.html`, `app.mjs`, `app.js`, `styles.css`, `fixture.json`, `icon.png`, `icon.webp`, and `font.woff2`. Use one `startServer(t)` helper that listens on port `0`, asserts `server.address().address === '127.0.0.1'`, and closes through `t.after`.

Write exactly these tests in `server.test.mjs`:

```js
test('GET and HEAD serve the shell with every security header', async t => {
  const origin = await startServer(t);
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${origin}/`, { method });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'none'");
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('rejects non-read methods', async t => {
  const origin = await startServer(t);
  const response = await fetch(`${origin}/`, { method: 'POST' });
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
    const response = await fetch(origin + pathname);
    assert.match(response.headers.get('content-type'), new RegExp(mime));
  }
  const unsupported = await fetch(`${origin}/secret.txt`);
  assert.equal(unsupported.status, 415);
  assert.match(unsupported.headers.get('content-type'), /text\\/plain/);
});

test('returns 404 without reflecting the requested path', async t => {
  const origin = await startServer(t);
  const response = await fetch(`${origin}/missing.js`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /missing\.js/);
});

test('rejects malformed encoding and paths outside the public root', async () => {
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
```

- [ ] **Step 2: Run the server test and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/server.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/app.mjs`.

- [ ] **Step 3: Implement the complete minimal server contract**

`app.mjs` must export `resolvePublicFile`, `createConsoleServer`, and the MIME/security constants. Keep path resolution separate from response writing so malformed and traversal cases remain unit-testable. Use `decodeURIComponent` once, `path.resolve(root, '.' + pathname)`, and accept the file only when it equals the root or starts with `${root}${path.sep}`.

`defaultJsonLoader` must use static imports with import attributes and an in-memory pathname map; it must not call `fetch`, XHR, or dynamic URLs. Add a counted browser test that stubs `fetch`/XHR and asserts both remain unused while fixtures load.

The loader test dynamically imports the repository after stubbing both APIs, loads all four fixture pathnames, and asserts zero calls. `tests/validation-fixtures.mjs` exports shared `baseItem` and `completeDecision` fixtures; both validation test modules import it explicitly, and ordinary packet cases pass `true` for the packet acknowledgement.

`start.mjs` must export:

```js
export function parsePort(value) {
  if (value === undefined) return 4177;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('PORT must be an integer from 1024 to 65535.');
  return port;
}

export async function startConsoleServer({ port = parsePort(process.env.PORT) } = {}) {
  const server = createConsoleServer();
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
```

The CLI branch calls `startConsoleServer`, then prints exactly one local URL. `index.html` must link these exact stylesheets: `/styles/tokens.css`, `/styles/base.css`, `/styles/layout.css`, `/styles/components.css`, `/styles/responsive.css`; it then loads `/src/app.mjs`. Do not add inline CSS or JavaScript.

- [ ] **Step 4: Run the server test and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/server.test.mjs
```

Expected: `6` tests pass with `0` failures and no warnings.

- [ ] **Step 5: Commit the server foundation**

```bash
git add tools/review-evidence-console/server tools/review-evidence-console/public/index.html tools/review-evidence-console/tests/server.test.mjs
git commit -m "feat: add reviewer console server"
```
