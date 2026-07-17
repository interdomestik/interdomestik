import { describe, expect, it, vi } from 'vitest';

import { protectNeutralOtpSession } from './neutral-otp-session';

function responseHeaders() {
  const headers = new Headers();
  headers.append('set-cookie', 'better-auth.session_token=signed-new; Path=/; HttpOnly');
  headers.append('set-cookie', 'better-auth.session_data=cached; Path=/; HttpOnly');
  return headers;
}

function fakeAuth(options: { fresh?: unknown; revokeError?: Error } = {}) {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(options.fresh ?? null),
      revokeSession: options.revokeError
        ? vi.fn().mockRejectedValue(options.revokeError)
        : vi.fn().mockResolvedValue({ status: true }),
    },
  };
}

describe('IDA-UI03a0b2 fresh Better Auth session guard', () => {
  it('C20 revokes exactly the new wrong-tenant token with its signed cookie and strips cookies', async () => {
    const auth = fakeAuth();
    const result = await protectNeutralOtpSession({
      auth,
      responseHeaders: responseHeaders(),
      verifyData: { token: 'new-row-token', user: { id: 'user-1', tenantId: 'tenant_mk' } },
      resolveDefaultTenantId: () => 'tenant_ks',
    });

    expect(auth.api.revokeSession).toHaveBeenCalledOnce();
    const call = auth.api.revokeSession.mock.calls[0]?.[0];
    expect(call.body).toEqual({ token: 'new-row-token' });
    expect(call.headers.get('cookie')).toContain('better-auth.session_token=signed-new');
    expect(result.decision).toBe('accountStop');
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(auth.api.revokeSession).toHaveBeenCalledWith({
      body: { token: 'new-row-token' },
      headers: expect.any(Headers),
    });
  });

  it('C21 strips every session cookie even when in-process revocation throws', async () => {
    const auth = fakeAuth({ revokeError: new Error('PRIVATE_DB_ERROR') });
    const log = vi.fn();
    const headers = responseHeaders();
    headers.append('set-cookie', 'app.better-auth.session_token_backup=keep; Path=/; HttpOnly');
    const result = await protectNeutralOtpSession({
      auth,
      log,
      responseHeaders: headers,
      verifyData: { token: 'new-row-token', user: { id: 'user-1', tenantId: 'tenant_mk' } },
      resolveDefaultTenantId: () => 'tenant_ks',
    });

    expect(result).toMatchObject({ decision: 'accountStop' });
    expect(result.headers.get('set-cookie')).toContain('app.better-auth.session_token_backup=keep');
    expect(log).toHaveBeenCalledWith('otp_session_revoke_failed');
  });

  it('C22 bypasses cookie cache and stops missing or mismatched authoritative sessions', async () => {
    const log = vi.fn();
    const auth = fakeAuth({
      fresh: {
        session: { token: 'new-row-token', userId: 'different-user' },
        user: {
          id: 'different-user',
          tenantId: 'tenant_ks',
          tenantClassificationPending: true,
        },
      },
    });
    const result = await protectNeutralOtpSession({
      auth,
      responseHeaders: responseHeaders(),
      verifyData: { token: 'new-row-token', user: { id: 'user-1', tenantId: 'tenant_ks' } },
      resolveDefaultTenantId: () => 'tenant_ks',
      log,
    });

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    expect(result.decision).toBe('accountStop');
    expect(result.headers.get('set-cookie')).toBeNull();

    auth.api.getSession.mockRejectedValueOnce(new Error('PRIVATE_DB_ERROR'));
    const unavailable = await protectNeutralOtpSession({
      auth,
      log,
      responseHeaders: responseHeaders(),
      verifyData: { token: 'new-row-token', user: { id: 'user-1', tenantId: 'tenant_ks' } },
      resolveDefaultTenantId: () => 'tenant_ks',
    });
    expect(unavailable.decision).toBe('accountStop');
    expect(unavailable.headers.get('set-cookie')).toBeNull();
    expect(log).toHaveBeenCalledWith('otp_fresh_session_failed');
    expect(auth.api.revokeSession).toHaveBeenCalledTimes(2);
  });
});
