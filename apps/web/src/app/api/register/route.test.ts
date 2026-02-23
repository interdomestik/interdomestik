import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
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
    hoisted.getSession.mockResolvedValue({
      user: { id: 'actor-1', name: 'Actor One', tenantId: 'tenant_mk' },
    });
    hoisted.registerUserApiCore.mockResolvedValue({
      ok: true,
      data: { success: true },
      status: 200,
    });
  });

  it('rejects host/session tenant mismatch with WRONG_TENANT_CONTEXT', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'actor-1', name: 'Actor One', tenantId: 'tenant_ks' },
    });

    const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.registerUserApiCore).not.toHaveBeenCalled();
  });

  it('allows registration when host and session tenants match', async () => {
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
  });

  it('allows neutral host requests when tenant context comes from fallback sources', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'actor-1', name: 'Actor One', tenantId: 'tenant_ks' },
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

  it.each([undefined, 'tenant_invalid'])(
    'allows request when session tenant is %s and host tenant is valid',
    async sessionTenantId => {
      hoisted.getSession.mockResolvedValue({
        user: { id: 'actor-1', name: 'Actor One', tenantId: sessionTenantId },
      });

      const res = await POST(buildRequest({ host: 'mk.localhost:3000' }));

      expect(res.status).toBe(200);
      expect(hoisted.registerUserApiCore).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_mk',
        }),
        expect.any(Object)
      );
    }
  );
});
