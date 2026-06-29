import assert from 'node:assert/strict';
import test from 'node:test';

const { hasUsableSessionState } = require('./session-cache.ts');
const { createAuthState, loginAs } = require('./shared.ts');

const RELEASE_GATE_BASE_URL = 'https://interdomestik-web.vercel.app';
const RELEASE_GATE_LOCALE = 'en';

function sessionCookie(value = 'fresh') {
  return {
    name: 'session',
    value,
    domain: 'interdomestik-web.vercel.app',
    path: '/',
  };
}

function successfulLoginResponse() {
  return {
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    url: () => `${RELEASE_GATE_BASE_URL}/api/auth/sign-in/email`,
  };
}

function createLoginPage(storageStates, counters) {
  let storageIndex = 0;
  return {
    context: () => ({
      clearCookies: async () => {
        counters.clearCookies += 1;
      },
      addCookies: async cookies => {
        counters.addCookies += 1;
        counters.addedCookies.push(...cookies);
      },
      storageState: async () => {
        const state = storageStates[Math.min(storageIndex, storageStates.length - 1)];
        storageIndex += 1;
        return state || { cookies: [] };
      },
    }),
    request: {
      post: async () => {
        counters.post += 1;
        return successfulLoginResponse();
      },
    },
    goto: async url => {
      counters.goto += 1;
      counters.gotoUrls.push(url);
    },
    waitForTimeout: async () => {},
    on: () => {},
    off: () => {},
  };
}

function createCounters() {
  return {
    addCookies: 0,
    addedCookies: [],
    clearCookies: 0,
    goto: 0,
    gotoUrls: [],
    post: 0,
  };
}

test('hasUsableSessionState requires restorable cookies', () => {
  assert.equal(hasUsableSessionState(null), false);
  assert.equal(hasUsableSessionState({ cookies: [] }), false);
  assert.equal(hasUsableSessionState({ origins: [{ origin: RELEASE_GATE_BASE_URL }] }), false);
  assert.equal(hasUsableSessionState({ cookies: [sessionCookie()] }), true);
});

test('loginAs ignores empty cached session state and replaces it with fresh cookies', async () => {
  const authState = createAuthState();
  authState.sessionStateByAccount.set('Member-only', { cookies: [] });

  const counters = createCounters();
  const page = createLoginPage([{ cookies: [sessionCookie('fresh')] }], counters);

  await loginAs(page, {
    account: 'member',
    credentials: { email: 'member@example.com', password: 'test-credential-2026' },
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
    authState,
  });

  assert.equal(counters.post, 1);
  assert.equal(counters.goto, 1);
  assert.equal(counters.addCookies, 0);
  assert.equal(authState.sessionStateByAccount.get('Member-only')?.cookies?.[0]?.value, 'fresh');
});

test('loginAs deletes stale cache when fresh login still yields no cookies', async () => {
  const authState = createAuthState();
  authState.sessionStateByAccount.set('Member-only', { cookies: [sessionCookie('stale')] });

  const counters = createCounters();
  const page = createLoginPage([{ cookies: [] }, { cookies: [] }], counters);

  await loginAs(page, {
    account: 'member',
    credentials: { email: 'member@example.com', password: 'test-credential-2026' },
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
    authState,
    forceFresh: true,
  });

  assert.equal(counters.post, 1);
  assert.equal(counters.goto, 1);
  assert.equal(authState.sessionStateByAccount.has('Member-only'), false);
});

test('loginAs bootstraps account landing before caching fresh cookies', async () => {
  const authState = createAuthState();
  const counters = createCounters();
  const page = createLoginPage([{ cookies: [sessionCookie('pre-bootstrap')] }], counters);

  await loginAs(page, {
    account: 'staff',
    credentials: { email: 'staff@example.com', password: 'test-credential-2026' },
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
    authState,
  });

  assert.equal(counters.post, 1);
  assert.deepEqual(counters.gotoUrls, [`${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff`]);
  assert.equal(
    authState.sessionStateByAccount.get('Staff')?.cookies?.find(cookie => cookie.name === 'session')
      ?.value,
    'pre-bootstrap'
  );
});
