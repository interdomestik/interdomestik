import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  registerMemberCore: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('@/lib/actions/agent/register-member', () => ({
  registerMemberCore: hoisted.registerMemberCore,
}));

import { POST } from './route';

function buildRequest(): NextRequest {
  return new NextRequest('http://mk.localhost:3000/api/register', {
    method: 'POST',
    headers: { host: 'mk.localhost:3000' },
    body: JSON.stringify({
      email: 'member@example.com',
      name: 'Member',
      password: 'password123',
      planId: 'standard',
    }),
  });
}

const agentSession = { user: { id: 'actor-1', role: 'agent', tenantId: 'tenant_mk' } };

describe('POST /api/register (retired)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.getSession.mockResolvedValue(agentSession);
  });

  it('refuses an agent with 410 and never registers a member', async () => {
    const res = await POST(buildRequest());

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toMatchObject({ code: 'DIRECT_REGISTRATION_RETIRED' });
    expect(hoisted.registerMemberCore).not.toHaveBeenCalled();
  });

  it('keeps the rate limit first', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 503 }));

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(hoisted.getSession).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller with 401', async () => {
    hoisted.getSession.mockResolvedValue(null);
    expect((await POST(buildRequest())).status).toBe(401);
  });

  it.each(['member', 'user', 'staff', 'branch_manager', 'tenant_admin', 'admin', undefined])(
    'refuses session role %s with 403',
    async role => {
      hoisted.getSession.mockResolvedValue({ user: { ...agentSession.user, role } });
      expect((await POST(buildRequest())).status).toBe(403);
      expect(hoisted.registerMemberCore).not.toHaveBeenCalled();
    }
  );
});
