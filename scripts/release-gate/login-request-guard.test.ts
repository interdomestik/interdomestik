import assert from 'node:assert/strict';
import test from 'node:test';

const { createAuthState, loginAs } = require('./shared.ts');

const RELEASE_GATE_BASE_URL = 'https://interdomestik-web.vercel.app';
const RELEASE_GATE_LOCALE = 'en';

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function createLoggedInPage(requestCalls) {
  return {
    context: () => ({
      clearCookies: async () => {},
      addCookies: async () => {},
      storageState: async () => ({
        cookies: [
          {
            name: 'session',
            value: 'fresh',
            domain: 'interdomestik-web.vercel.app',
            path: '/',
          },
        ],
      }),
    }),
    request: {
      post: async (...args) => {
        requestCalls.push(args);
        return {
          ok: () => true,
          status: () => 200,
          headers: () => ({}),
          url: () => `${RELEASE_GATE_BASE_URL}/api/auth/sign-in/email`,
        };
      },
    },
    goto: async () => {},
    waitForTimeout: async () => {},
    on: () => {},
    off: () => {},
  };
}

test('loginAs sends Vercel protection headers on preview API login requests', async () => {
  const originalBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  const requestCalls = [];

  try {
    await loginAs(createLoggedInPage(requestCalls), {
      account: 'member',
      credentials: { email: 'member@example.com', password: 'test-credential-2026' },
      baseUrl: RELEASE_GATE_BASE_URL,
      locale: RELEASE_GATE_LOCALE,
      authState: createAuthState(),
    });
  } finally {
    restoreEnv('VERCEL_AUTOMATION_BYPASS_SECRET', originalBypassSecret);
  }

  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0][1].headers['x-vercel-protection-bypass'], 'bypass-secret');
  assert.equal(requestCalls[0][1].headers['x-vercel-set-bypass-cookie'], 'true');
  assert.equal(requestCalls[0][1].maxRedirects, 0);
});

test('loginAs rejects external successful responses from protected deployment login', async () => {
  const page = createLoggedInPage([]);
  page.request.post = async () => ({
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    url: () => 'https://vercel.com/sso-api?url=https%3A%2F%2Fpreview.vercel.app',
  });

  await assert.rejects(
    () =>
      loginAs(page, {
        account: 'member',
        credentials: { email: 'member@example.com', password: 'test-credential-2026' },
        baseUrl: RELEASE_GATE_BASE_URL,
        locale: RELEASE_GATE_LOCALE,
        authState: createAuthState(),
      }),
    /AUTH_LOGIN_REDIRECTED account=member status=200 expected_origin=https:\/\/interdomestik-web\.vercel\.app actual_origin=https:\/\/vercel\.com url=https:\/\/vercel\.com\/sso-api/
  );
});
