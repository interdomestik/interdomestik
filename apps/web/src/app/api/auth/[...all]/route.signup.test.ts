import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoisted } from './route.test-support';
import { POST } from './route';

describe('password sign-up admission', () => {
  function request(tenant = 'tenant_ks', forwarded?: string) {
    return new Request('https://ida.interdomestik.com/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        host: 'ida.interdomestik.com',
        'content-type': 'application/json',
        ...(forwarded ? { 'x-forwarded-host': forwarded } : {}),
      },
      body: JSON.stringify({ onboarding: { tenant, mode: 'deferred' } }),
    });
  }

  beforeEach(() => {
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '1');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    hoisted.enforceRateLimit.mockReset().mockResolvedValue(null);
    hoisted.publicIntakeOpen.mockReset().mockResolvedValue(false);
    hoisted.handlerPOST.mockReset().mockResolvedValue(new Response());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns the existing unauthorized shape before reaching Better Auth when intake is closed', async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.publicIntakeOpen).toHaveBeenCalledExactlyOnceWith('tenant_ks');
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });

  it('admits a matching selector only while its ingress tenant is open', async () => {
    hoisted.publicIntakeOpen.mockResolvedValue(true);
    expect((await POST(request('tenant_mk'))).status).toBe(401);
    expect(hoisted.publicIntakeOpen).not.toHaveBeenCalled();
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(hoisted.publicIntakeOpen).toHaveBeenCalledExactlyOnceWith('tenant_ks');
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
  });

  it('rejects a forwarded-host mismatch before rate limits, admission and Better Auth', async () => {
    expect((await POST(request('tenant_ks', 'other.example'))).status).toBe(401);
    expect(hoisted.enforceRateLimit).not.toHaveBeenCalled();
    expect(hoisted.publicIntakeOpen).not.toHaveBeenCalled();
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });
});
