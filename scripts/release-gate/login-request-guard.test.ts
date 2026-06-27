import assert from 'node:assert/strict';
import test from 'node:test';

const { createAuthState, loginAs } = require('./shared.ts');
const { postLoginRequestWithTrustedRedirect } = require('./login-request-guard.ts');

const RELEASE_GATE_BASE_URL = 'https://interdomestik-web.vercel.app';
const RELEASE_GATE_LOCALE = 'en';

function successLoginResponse(path = '/api/auth/sign-in/email') {
  return {
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    url: () => `${RELEASE_GATE_BASE_URL}${path}`,
  };
}

async function withBypassSecret(fn) {
  const originalBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret';
  try {
    return await fn();
  } finally {
    if (originalBypassSecret === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = originalBypassSecret;
  }
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
        return successLoginResponse();
      },
    },
    goto: async () => {},
    waitForTimeout: async () => {},
    on: () => {},
    off: () => {},
  };
}

test('loginAs sends Vercel protection headers on preview API login requests', async () => {
  const requestCalls = [];
  await withBypassSecret(async () => {
    await loginAs(createLoggedInPage(requestCalls), {
      account: 'member',
      credentials: { email: 'member@example.com', password: 'test-credential-2026' },
      baseUrl: RELEASE_GATE_BASE_URL,
      locale: RELEASE_GATE_LOCALE,
      authState: createAuthState(),
    });
  });

  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0][1].headers['x-vercel-protection-bypass'], 'bypass-secret');
  assert.equal(requestCalls[0][1].headers['x-vercel-set-bypass-cookie'], 'true');
  assert.equal(requestCalls[0][1].maxRedirects, 0);
});

test('loginAs manually follows only same-origin auth canonical redirects', async () => {
  const requestCalls = [];
  const page = createLoggedInPage(requestCalls);
  page.request.post = async (...args) => {
    requestCalls.push(args);
    if (requestCalls.length === 1) {
      return {
        ok: () => false,
        status: () => 307,
        headers: () => ({
          location: `${RELEASE_GATE_BASE_URL}/api/auth/sign-in/email/`,
        }),
        url: () => `${RELEASE_GATE_BASE_URL}/api/auth/sign-in/email`,
      };
    }
    return successLoginResponse('/api/auth/sign-in/email/');
  };

  await withBypassSecret(async () => {
    await loginAs(page, {
      account: 'member',
      credentials: { email: 'member@example.com', password: 'test-credential-2026' },
      baseUrl: RELEASE_GATE_BASE_URL,
      locale: RELEASE_GATE_LOCALE,
      authState: createAuthState(),
    });
  });

  assert.equal(requestCalls.length, 2);
  assert.equal(requestCalls[1][0], `${RELEASE_GATE_BASE_URL}/api/auth/sign-in/email/`);
  assert.equal(requestCalls[1][1].headers['x-vercel-protection-bypass'], 'bypass-secret');
  assert.equal(requestCalls[1][1].maxRedirects, 0);
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

test('trusted redirect helper does not follow external auth redirects', async () => {
  let postCalls = 0;
  const response = {
    status: () => 307,
    headers: () => ({ location: 'https://vercel.com/sso-api' }),
  };
  const result = await postLoginRequestWithTrustedRedirect({
    request: { post: async () => ((postCalls += 1), response) },
    loginUrl: `${RELEASE_GATE_BASE_URL}/api/auth/sign-in/email`,
    requestOptions: {},
    origin: RELEASE_GATE_BASE_URL,
  });
  assert.equal(result, response);
  assert.equal(postCalls, 1);
});
