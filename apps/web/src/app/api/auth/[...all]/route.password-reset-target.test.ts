import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  appendAnonymousTenantAuditEvent: vi.fn(),
  lookupUserTenantByEmail: vi.fn(),
  after: vi.fn(),
  handlerPOST: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('@interdomestik/database', () => ({
  appendAnonymousTenantAuditEvent: hoisted.appendAnonymousTenantAuditEvent,
}));
vi.mock('@/lib/auth/tenant-lookup', () => ({
  lookupUserTenantByEmail: hoisted.lookupUserTenantByEmail,
}));
vi.mock('next/server', async importOriginal => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: hoisted.after,
}));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: hoisted.handlerPOST }),
}));

import { POST } from './route';

const ENV_KEYS = [
  'VERCEL',
  'VERCEL_URL',
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_TRUSTED_ORIGINS',
];

function resetRequest(body: unknown, requestUrl: string, host: string): Request {
  return new Request(`${requestUrl}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { host, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function runAfterCallbacks(): Promise<void> {
  for (const [callback] of hoisted.after.mock.calls) await callback();
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) vi.stubEnv(key, '');
  hoisted.enforceRateLimit.mockResolvedValue(null);
  hoisted.handlerPOST.mockResolvedValue(new Response('ok', { status: 200 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/request-password-reset target on production (SEC-11)', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
  });

  const productionRequest = (redirectTo: unknown, host = 'ida.interdomestik.com') =>
    resetRequest({ email: 'member@example.test', redirectTo }, `https://${host}`, host);

  it.each([
    'https://staging.interdomestik.com/sq/reset-password',
    'https://interdomestik-abc123-ecohub.vercel.app/sq/reset-password',
    'https://www.interdomestik.com/sq/reset-password',
    'https://evil.example.test/sq/reset-password',
    'http://ida.interdomestik.com/sq/reset-password',
    'https://ida.interdomestik.com:8443/sq/reset-password',
    'https://user@ida.interdomestik.com/sq/reset-password',
    '//evil.example.test/sq/reset-password',
    '/\\evil.example.test',
    'javascript:alert(1)',
    '',
    42,
    ['/sq/reset-password'],
  ])('refuses the target %j and sends no mail', async redirectTo => {
    const res = await POST(productionRequest(redirectTo));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: 'INVALID_REDIRECT',
      message: 'Invalid redirect target',
    });
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
    expect(hoisted.after).not.toHaveBeenCalled();
  });

  it('does not let a request served under another host widen the trusted origin', async () => {
    const res = await POST(
      productionRequest('https://evil.example.test/sq/reset-password', 'evil.example.test')
    );

    expect(res.status).toBe(400);
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, null],
    ['/sq/reset-password', '/sq/reset-password'],
    [
      'https://IDA.interdomestik.com/sq/reset-password',
      'https://ida.interdomestik.com/sq/reset-password',
    ],
  ])(
    'records a cookie-free one-door request with target %j in the account tenant after the response',
    async (redirectTo, recorded) => {
      hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_ks');

      const res = await POST(
        resetRequest(
          { email: ' Member@Example.test ', redirectTo },
          'http://localhost:3000',
          'ida.interdomestik.com'
        )
      );

      expect(res.status).toBe(200);
      expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
      expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
      expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();

      await runAfterCallbacks();

      expect(hoisted.lookupUserTenantByEmail).toHaveBeenCalledWith('member@example.test');
      expect(hoisted.appendAnonymousTenantAuditEvent).toHaveBeenCalledWith({
        action: 'auth.password_reset_requested',
        entityType: 'auth',
        tenantId: 'tenant_ks',
        metadata: { route: '/api/auth/request-password-reset', redirectTarget: recorded },
      });
    }
  );

  it('keeps the worst-case record under the audit cap, so a crafted target cannot suppress it', async () => {
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_ks');
    const request = new Request('https://ida.interdomestik.com/api/auth/request-password-reset', {
      method: 'POST',
      headers: {
        host: 'ida.interdomestik.com',
        'content-type': 'application/json',
        'user-agent': '"'.repeat(512),
        'x-forwarded-for': '1'.repeat(64),
      },
      body: JSON.stringify({
        email: 'member@example.test',
        redirectTo: `/${'\ud800'.repeat(255)}`,
      }),
    });

    expect((await POST(request)).status).toBe(200);
    await runAfterCallbacks();

    const [{ metadata }] = hoisted.appendAnonymousTenantAuditEvent.mock.calls[0];
    expect(metadata.redirectTarget).toBe(`/${'?'.repeat(255)}`);
    expect(Buffer.byteLength(JSON.stringify(metadata), 'utf8')).toBeLessThanOrEqual(2_048);
  });

  it('records nothing when the address has no account', async () => {
    hoisted.lookupUserTenantByEmail.mockResolvedValue(null);

    const res = await POST(productionRequest('/sq/reset-password'));
    await runAfterCallbacks();

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
  });

  it('still serves the request when the after-response record fails', async () => {
    hoisted.lookupUserTenantByEmail.mockRejectedValue(new Error('db down'));

    const res = await POST(productionRequest('/sq/reset-password'));

    expect(res.status).toBe(200);
    await expect(runAfterCallbacks()).resolves.toBeUndefined();
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/request-password-reset target on a local server (SEC-11)', () => {
  it('serves a tenant-host target although the request URL carries the listening address', async () => {
    const res = await POST(
      resetRequest(
        {
          email: 'member@example.test',
          redirectTo: 'http://ks.127.0.0.1.nip.io:3000/sq/reset-password',
        },
        'http://localhost:3000',
        'ks.127.0.0.1.nip.io:3000'
      )
    );

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
    expect(hoisted.appendAnonymousTenantAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_ks',
        metadata: expect.objectContaining({
          redirectTarget: 'http://ks.127.0.0.1.nip.io:3000/sq/reset-password',
        }),
      })
    );
  });

  it('refuses a foreign target on a local server', async () => {
    const res = await POST(
      resetRequest(
        { email: 'member@example.test', redirectTo: 'http://evil.example.test/sq/reset-password' },
        'http://localhost:3000',
        'ks.127.0.0.1.nip.io:3000'
      )
    );

    expect(res.status).toBe(400);
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });
});
