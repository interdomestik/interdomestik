import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  registerUserApiCore: vi.fn(),
  registerMemberCore: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('./_core', () => ({
  registerUserApiCore: hoisted.registerUserApiCore,
}));

vi.mock('@/lib/actions/agent/register-member', () => ({
  registerMemberCore: hoisted.registerMemberCore,
}));

import { POST } from './route';

function buildRequest(headers: HeadersInit = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'member@example.com',
      name: 'Member',
      role: 'user',
      password: 'password123',
    }),
  });
}

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.getSession.mockResolvedValue({
      user: {
        id: 'actor-1',
        name: 'Actor One',
        role: 'agent',
        tenantId: 'tenant_mk',
        branchId: 'branch-mk',
      },
    });
    hoisted.registerMemberCore.mockResolvedValue({ ok: true });
    hoisted.registerUserApiCore.mockResolvedValue({
      ok: true,
      data: { success: true },
      status: 200,
    });
  });

  it('rejects host/session tenant mismatch with WRONG_TENANT_CONTEXT', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'actor-1', name: 'Actor One', role: 'agent', tenantId: 'tenant_ks' },
    });

    const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.registerUserApiCore).not.toHaveBeenCalled();
  });

  it('allows agent registration when host and session tenants match', async () => {
    const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(hoisted.registerUserApiCore).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_mk',
        actor: { id: 'actor-1', name: 'Actor One' },
      }),
      expect.objectContaining({
        registerMemberFn: expect.any(Function),
      })
    );
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/register',
        productionSensitive: true,
      })
    );

    const servicesArg = hoisted.registerUserApiCore.mock.calls[0][1];
    const formData = new FormData();
    await servicesArg.registerMemberFn({ id: 'actor-1', name: 'Actor One' }, 'tenant_mk', formData);
    expect(hoisted.registerMemberCore).toHaveBeenCalledWith(
      { id: 'actor-1', name: 'Actor One' },
      'tenant_mk',
      'branch-mk',
      formData
    );
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 503 }));

    const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('limited');
    expect(hoisted.getSession).not.toHaveBeenCalled();
    expect(hoisted.registerUserApiCore).not.toHaveBeenCalled();
  });

  it.each([
    ['member'],
    ['user'],
    ['staff'],
    ['branch_manager'],
    ['tenant_admin'],
    ['admin'],
    ['super_admin'],
    [undefined],
  ])('rejects non-agent session role %s', async role => {
    hoisted.getSession.mockResolvedValue({
      user: {
        id: 'actor-1',
        name: 'Actor One',
        role,
        tenantId: 'tenant_mk',
      },
    });

    const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(hoisted.registerUserApiCore).not.toHaveBeenCalled();
  });

  it('allows neutral host requests when tenant context comes from fallback sources', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'actor-1', name: 'Actor One', role: 'agent', tenantId: 'tenant_ks' },
    });

    const res = await POST(
      buildRequest({
        host: 'localhost:3000',
        'x-tenant-id': 'tenant_ks',
      })
    );

    expect(res.status).toBe(200);
    expect(hoisted.registerUserApiCore).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_ks',
      }),
      expect.any(Object)
    );
  });

  it('rejects neutral host fallback tenant mismatch with WRONG_TENANT_CONTEXT', async () => {
    const res = await POST(
      buildRequest({
        host: 'localhost:3000',
        'x-tenant-id': 'tenant_ks',
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.registerUserApiCore).not.toHaveBeenCalled();
  });

  it.each([undefined, 'tenant_invalid'])(
    'rejects request when session tenant is %s even if host tenant is valid',
    async sessionTenantId => {
      hoisted.getSession.mockResolvedValue({
        user: {
          id: 'actor-1',
          name: 'Actor One',
          role: 'agent',
          tenantId: sessionTenantId,
        },
      });

      const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        code: 'WRONG_TENANT_CONTEXT',
        message: 'Wrong tenant context',
      });
      expect(hoisted.registerUserApiCore).not.toHaveBeenCalled();
    }
  );
});
