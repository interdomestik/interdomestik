import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthRuntime } from '../public/src/app/auth-runtime.mjs';

const account = {
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
};

test('auth runtime restores a live session and handles explicit logout', async () => {
  const states = [];
  const client = {
    session: async () => account,
    login: async () => account,
    logout: async () => undefined,
  };
  const runtime = createAuthRuntime({ client, onState: state => states.push(state) });
  await runtime.start();
  assert.deepEqual(states.at(-1), { status: 'authenticated', account });
  await runtime.logout();
  assert.deepEqual(states.at(-1), { status: 'anonymous', reason: 'logout' });
});

test('auth runtime renders generic login failure and explicit session expiry', async () => {
  const states = [];
  const expired = Object.assign(new Error(), { code: 'session_expired' });
  const client = {
    session: async () => Promise.reject(expired),
    login: async () => Promise.reject(expired),
    logout: async () => undefined,
  };
  const runtime = createAuthRuntime({ client, onState: state => states.push(state) });
  await runtime.start();
  assert.deepEqual(states.at(-1), { status: 'anonymous', reason: 'session_expired' });
  await runtime.login({ username: 'gazmend', password: 'wrong' });
  assert.deepEqual(states.at(-1), {
    status: 'anonymous',
    reason: 'authentication_failed',
    username: 'gazmend',
  });
  runtime.expire();
  assert.deepEqual(states.at(-1), { status: 'anonymous', reason: 'session_expired' });
});

test('auth runtime exposes pending state before login resolves', async () => {
  const states = [];
  let resolveLogin;
  const runtime = createAuthRuntime({
    client: {
      session: async () => Promise.reject(Object.assign(new Error(), { code: 'session_expired' })),
      login: () => new Promise(resolve => (resolveLogin = resolve)),
      logout: async () => undefined,
    },
    onState: state => states.push(state),
  });
  const pending = runtime.login({ username: 'gazmend', password: 'secret' });
  assert.deepEqual(states.at(-1), { status: 'authenticating' });
  resolveLogin(account);
  await pending;
  assert.deepEqual(states.at(-1), { status: 'authenticated', account });
});

test('auth runtime preserves service and origin failures during login', async () => {
  for (const code of ['unavailable', 'forbidden']) {
    const states = [];
    const runtime = createAuthRuntime({
      client: {
        login: async () => Promise.reject(Object.assign(new Error(), { code })),
        logout: async () => undefined,
      },
      onState: state => states.push(state),
    });
    await runtime.login({ username: 'gazmend', password: 'secret' });
    assert.deepEqual(states.at(-1), { status: 'anonymous', reason: code, username: 'gazmend' });
  }
});

test('auth runtime clears rendered access at the server session expiry', async () => {
  const states = [];
  let expire;
  const runtime = createAuthRuntime({
    client: {
      session: async () => ({ ...account, sessionExpiresAt: 101 }),
      logout: async () => {},
    },
    onState: state => states.push(state),
    now: () => 100_000,
    setTimer: callback => {
      expire = callback;
      return 1;
    },
    clearTimer() {},
  });
  await runtime.start();
  expire();
  assert.deepEqual(states.at(-1), { status: 'anonymous', reason: 'session_expired' });
});
