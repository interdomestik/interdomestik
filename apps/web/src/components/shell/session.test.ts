import { getCookies } from 'better-auth/cookies';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authConfig } from '@/lib/auth/config';
import { authProviders } from '@/lib/auth/providers';

type MockSession = { user: { id: string } } | null;

const HOST = 'ks.localhost:3000';
const VALID_TOKEN = 'valid-token';

const state = {
  authModuleLoads: 0,
  requestHeaders: new Headers({ host: HOST }),
};

const getSessionMock = vi.fn<(args: { headers: Headers }) => Promise<MockSession>>();
const headersMock = vi.fn(async () => state.requestHeaders);

function setHeaders(init: Record<string, string>) {
  state.requestHeaders = new Headers({ host: HOST, ...init });
}

function credentialAwareProvider({ headers }: { headers: Headers }): Promise<MockSession> {
  const cookie = headers.get('cookie') ?? '';
  const authorization = headers.get('authorization') ?? '';
  const presentsValidToken =
    cookie.includes(`=${VALID_TOKEN}`) || authorization === `Bearer ${VALID_TOKEN}`;
  return Promise.resolve(presentsValidToken ? { user: { id: 'staff-1' } } : null);
}

/**
 * Loads a fresh `session` module instance with freshly registered mocks, so each
 * test observes real module-initialization behavior (and empty session caches)
 * instead of results cached by an earlier test.
 */
async function loadSession() {
  vi.resetModules();
  state.authModuleLoads = 0;
  getSessionMock.mockReset();
  getSessionMock.mockImplementation(credentialAwareProvider);

  vi.doMock('@/lib/auth', () => {
    state.authModuleLoads += 1;
    return { auth: { api: { getSession: getSessionMock } } };
  });
  vi.doMock('next/headers', () => ({ headers: headersMock }));

  return await import('./session');
}

describe('getSessionSafe', () => {
  beforeEach(() => {
    setHeaders({});
  });

  describe('anonymous requests', () => {
    it('never initializes the auth module when no cookie or authorization is present', async () => {
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('LoginPage');

      expect(session).toBeNull();
      expect(state.authModuleLoads).toBe(0);
      expect(getSessionMock).toHaveBeenCalledTimes(0);
    });

    it('never initializes the auth module for unrelated cookies', async () => {
      setHeaders({ cookie: 'NEXT_LOCALE=sq; theme=dark; id_consent=1' });
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('LoginPage');

      expect(session).toBeNull();
      expect(state.authModuleLoads).toBe(0);
      expect(getSessionMock).toHaveBeenCalledTimes(0);
    });

    it('returns immediately without retry when no auth hint is present', async () => {
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('LoggedOutRequest');

      expect(session).toBeNull();
      expect(getSessionMock).toHaveBeenCalledTimes(0);
    });

    it('loads the auth module only once a later request carries credentials', async () => {
      const { getSessionSafe } = await loadSession();

      await getSessionSafe('LoginPage');
      expect(state.authModuleLoads).toBe(0);

      setHeaders({ cookie: `better-auth.session_token=${VALID_TOKEN}` });
      const session = await getSessionSafe('LoginPage');

      expect(session).toEqual({ user: { id: 'staff-1' } });
      expect(state.authModuleLoads).toBe(1);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('credential-bearing requests', () => {
    it('recognizes the session cookie emitted by the current provider configuration', async () => {
      const { sessionToken } = getCookies({ ...authConfig, ...authProviders });
      setHeaders({ cookie: `${sessionToken.name}=${VALID_TOKEN}` });
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('StaffLayout');

      expect(session).toEqual({ user: { id: 'staff-1' } });
      expect(state.authModuleLoads).toBe(1);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['plain', `better-auth.session_token=${VALID_TOKEN}`],
      ['__Secure prefixed', `__Secure-better-auth.session_token=${VALID_TOKEN}`],
      ['__Host prefixed', `__Host-better-auth.session_token=${VALID_TOKEN}`],
    ])('verifies a %s session cookie', async (_label, cookie) => {
      setHeaders({ cookie });
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('StaffLayout');

      expect(session).toEqual({ user: { id: 'staff-1' } });
      expect(state.authModuleLoads).toBe(1);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });

    it('verifies an authorization header without any cookie', async () => {
      setHeaders({ authorization: `Bearer ${VALID_TOKEN}` });
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('StaffLayout');

      expect(session).toEqual({ user: { id: 'staff-1' } });
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });

    it('retries once and returns null for a tampered session token', async () => {
      setHeaders({ cookie: 'better-auth.session_token=tampered' });
      const { getSessionSafe } = await loadSession();

      const session = await getSessionSafe('StaffLayout');

      expect(session).toBeNull();
      expect(getSessionMock).toHaveBeenCalledTimes(2);
    });

    it('fails closed when the auth provider throws', async () => {
      setHeaders({ cookie: `better-auth.session_token=${VALID_TOKEN}` });
      const { getSessionSafe } = await loadSession();
      getSessionMock.mockRejectedValue(new Error('provider unavailable'));

      const session = await getSessionSafe('StaffLayout');

      expect(session).toBeNull();
      expect(getSessionMock).toHaveBeenCalledTimes(2);
    });

    it('fails closed when the auth module itself cannot be loaded', async () => {
      setHeaders({ cookie: `better-auth.session_token=${VALID_TOKEN}` });
      vi.resetModules();
      state.authModuleLoads = 0;
      getSessionMock.mockReset();
      vi.doMock('@/lib/auth', () => {
        throw new Error('auth module initialization failed');
      });
      vi.doMock('next/headers', () => ({ headers: headersMock }));
      const { getSessionSafe } = await import('./session');

      const session = await getSessionSafe('StaffLayout');

      expect(session).toBeNull();
      expect(getSessionMock).toHaveBeenCalledTimes(0);
    });
  });

  describe('session cache', () => {
    it('deduplicates session fetches for the same request signature', async () => {
      setHeaders({ cookie: `better-auth.session_token=${VALID_TOKEN}` });
      const { getSessionSafe } = await loadSession();

      const first = await getSessionSafe('StaffLayout');
      const second = await getSessionSafe('StaffClaimsPage');

      expect(first).toEqual(second);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent fetches for the same request signature', async () => {
      setHeaders({ cookie: `better-auth.session_token=${VALID_TOKEN}` });
      const { getSessionSafe } = await loadSession();

      let release: (() => void) | undefined;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      getSessionMock.mockImplementation(async args => {
        await gate;
        return credentialAwareProvider(args);
      });

      const pending = Promise.all([
        getSessionSafe('StaffLayout'),
        getSessionSafe('StaffClaimsPage'),
        getSessionSafe('StaffCrmPage'),
      ]);
      await vi.waitFor(() => expect(getSessionMock).toHaveBeenCalledTimes(1));
      release?.();
      const [a, b, c] = await pending;

      expect(a).toEqual({ user: { id: 'staff-1' } });
      expect(b).toEqual(a);
      expect(c).toEqual(a);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });

    it('does not share a cached session across hosts for the same cookie', async () => {
      const cookie = `better-auth.session_token=${VALID_TOKEN}`;
      state.requestHeaders = new Headers({ host: 'ks.localhost:3000', cookie });
      const { getSessionSafe } = await loadSession();

      const first = await getSessionSafe('StaffLayout');
      state.requestHeaders = new Headers({ host: 'mk.localhost:3000', cookie });
      const second = await getSessionSafe('StaffLayout');

      expect(first).toEqual({ user: { id: 'staff-1' } });
      expect(second).toEqual({ user: { id: 'staff-1' } });
      expect(getSessionMock).toHaveBeenCalledTimes(2);
    });

    it('does not share a cached session across different credential headers', async () => {
      setHeaders({ authorization: `Bearer ${VALID_TOKEN}` });
      const { getSessionSafe } = await loadSession();

      const first = await getSessionSafe('StaffLayout');
      setHeaders({ authorization: `Bearer ${VALID_TOKEN}-other` });
      const second = await getSessionSafe('StaffLayout');

      expect(first).toEqual({ user: { id: 'staff-1' } });
      expect(second).toBeNull();
      expect(getSessionMock).toHaveBeenCalledTimes(3); // 1 cached miss + 2 attempts for the retried unknown token
    });
  });
});
