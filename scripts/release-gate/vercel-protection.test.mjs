import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildVercelProtectionHeaders,
  installVercelProtectionBrowser,
  installVercelProtectionFetch,
} = require('./vercel-protection.ts');

test('buildVercelProtectionHeaders adds Vercel bypass and cookie headers for protected previews', () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  assert.deepEqual(buildVercelProtectionHeaders('https://preview.vercel.app'), {
    'x-vercel-protection-bypass': 'bypass-secret',
    'x-vercel-set-bypass-cookie': 'true',
  });
  assert.deepEqual(buildVercelProtectionHeaders('https://staging.interdomestik.com'), {
    'x-vercel-protection-bypass': 'bypass-secret',
    'x-vercel-set-bypass-cookie': 'true',
  });
});

test('installVercelProtectionBrowser scopes bypass headers to Vercel requests', async () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  let routeHandler;
  const browser = {
    async newContext(options) {
      assert.deepEqual(options, { viewport: { width: 800, height: 600 } });
      return {
        async route(pattern, handler) {
          assert.equal(pattern, '**/*');
          routeHandler = handler;
        },
      };
    },
  };
  installVercelProtectionBrowser('https://staging.interdomestik.com', browser);
  await browser.newContext({ viewport: { width: 800, height: 600 } });
  assert.ok(routeHandler, 'route handler was registered');

  const continuations = [];
  routeHandler({
    request: () => ({
      headers: () => ({ accept: 'text/html' }),
      url: () => 'https://staging.interdomestik.com/member',
    }),
    continue: params => continuations.push(params),
  });
  routeHandler({
    request: () => ({
      headers: () => ({ accept: 'text/html' }),
      url: () => 'https://preview.vercel.app/asset.js',
    }),
    continue: params => continuations.push(params),
  });

  assert.equal(continuations[0].headers['x-vercel-protection-bypass'], 'bypass-secret');
  assert.equal(continuations[0].headers['x-vercel-set-bypass-cookie'], 'true');
  assert.equal(continuations[1], undefined);
});

test('installVercelProtectionFetch scopes bypass headers to the protected host', async () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_input, init = {}) => {
    calls.push(init.headers);
    return { ok: true };
  };
  delete globalThis.fetch.__vercelProtectionWrapped;
  try {
    installVercelProtectionFetch('https://staging.interdomestik.com');
    await globalThis.fetch('https://staging.interdomestik.com/api/health');
    await globalThis.fetch('https://preview.vercel.app/api/health');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls[0].get('x-vercel-protection-bypass'), 'bypass-secret');
  assert.equal(calls[1], undefined);
});

test('buildVercelProtectionHeaders ignores non-Vercel hosts and missing secrets', () => {
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  assert.deepEqual(buildVercelProtectionHeaders('https://www.interdomestik.com'), {});
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  assert.deepEqual(buildVercelProtectionHeaders('https://preview.vercel.app'), {});
});
