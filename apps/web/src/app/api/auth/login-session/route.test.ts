import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ providerGet: vi.fn(), select: vi.fn() }));
vi.mock('../[...all]/route', () => ({ GET: mocks.providerGet }));
vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  db: { select: mocks.select },
  userRoles: {
    id: 'id',
    userId: 'userId',
    tenantId: 'tenantId',
    role: 'role',
    branchId: 'branchId',
  },
}));
vi.mock('@interdomestik/domain-users/admin/access', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/domain-users/admin/access')>();
  const actualGuard = actual.requireTenantAdminOrBranchManagerSession;
  return { ...actual, requireTenantAdminOrBranchManagerSession: vi.fn(actualGuard) };
});

import { requireTenantAdminOrBranchManagerSession } from '@interdomestik/domain-users/admin/access';
import { GET } from './route';

const guard = vi.mocked(requireTenantAdminOrBranchManagerSession);
const PROVIDER_COOKIES = [
  'better-auth.session_token=synthetic; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT; HttpOnly',
  'better-auth.session_data=synthetic-cache; Path=/; HttpOnly',
];

function providerPayload(role?: string, tenantId?: string) {
  return {
    session: { expiresAt: '2031-01-01T00:00:00.000Z', token: 'synthetic-token' },
    user: { email: 'synthetic@example.com', id: 'synthetic-user', role, tenantId },
  };
}

function providerSuccess(payload: unknown): Response {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-encoding': 'br',
    'content-length': '512',
    etag: 'W/"synthetic"',
    'last-modified': 'Wed, 01 Jan 2031 00:00:00 GMT',
    pragma: 'no-cache',
  });
  for (const cookie of PROVIDER_COOKIES) headers.append('set-cookie', cookie);

  return new Response(JSON.stringify(payload), { headers, status: 200 });
}

function providerDenial(status: number): Response {
  const headers = new Headers({ 'cache-control': 'no-store', 'retry-after': '60' });
  headers.append('set-cookie', PROVIDER_COOKIES[1]!);

  return new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { headers, status });
}

function loginRequest(search = '?role=admin&tenantId=tenant-evil&disableRefresh=true'): Request {
  return new Request(`https://app.interdomestik.test/api/auth/login-session${search}`, {
    headers: {
      cookie: 'better-auth.session_token=synthetic',
      'user-agent': 'synthetic-agent',
      'x-forwarded-for': '198.51.100.7',
    },
  });
}

async function readPayload(response: Response): Promise<unknown> {
  return response.json();
}

describe('login-only session endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerGet.mockResolvedValue(providerSuccess(providerPayload('member', 'tenant-1')));
  });

  it('invokes the canonical provider session exactly once with the original request', async () => {
    const controller = new AbortController();
    const request = new Request(
      'https://app.interdomestik.test/api/auth/login-session?tenantId=x',
      {
        headers: { cookie: 'better-auth.session_token=synthetic', 'user-agent': 'synthetic-agent' },
        signal: controller.signal,
      }
    );

    await GET(request);

    expect(mocks.providerGet).toHaveBeenCalledOnce();
    const forwarded = mocks.providerGet.mock.calls[0]?.[0] as Request;
    // Same origin, canonical provider path, and none of the caller's query controls.
    expect(forwarded.url).toBe('https://app.interdomestik.test/api/auth/get-session');
    expect(forwarded.method).toBe('GET');
    expect(forwarded.headers.get('cookie')).toBe('better-auth.session_token=synthetic');
    expect(forwarded.headers.get('user-agent')).toBe('synthetic-agent');
    expect(forwarded.signal.aborted).toBe(false);
    controller.abort();
    expect(forwarded.signal.aborted).toBe(true);
  });

  it('preserves every caller header the limiters key on', async () => {
    await GET(loginRequest());

    const forwarded = mocks.providerGet.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get('x-forwarded-for')).toBe('198.51.100.7');
    expect(new URL(forwarded.url).search).toBe('');
  });

  it.each([401, 429, 503])('forwards the %s provider denial unchanged', async status => {
    const denial = providerDenial(status);
    mocks.providerGet.mockResolvedValue(denial);

    const response = await GET(loginRequest());

    expect(response).toBe(denial);
    expect(response.status).toBe(status);
    expect(response.bodyUsed).toBe(false);
    expect(response.headers.getSetCookie()).toEqual([PROVIDER_COOKIES[1]]);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(guard).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('returns the minimal payload while keeping provider cookies and cache directives', async () => {
    const response = await GET(loginRequest());

    expect(response.status).toBe(200);
    expect(await readPayload(response)).toEqual({ hasAdminAccess: false, role: 'member' });
    expect(response.headers.getSetCookie()).toEqual(PROVIDER_COOKIES);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    for (const stale of ['content-encoding', 'content-length', 'etag', 'last-modified']) {
      expect(response.headers.get(stale)).toBeNull();
    }
  });

  it.each(['admin', 'tenant_admin'])(
    'grants %s from exactly the same verified session',
    async role => {
      mocks.providerGet.mockResolvedValue(providerSuccess(providerPayload(role, 'tenant-1')));

      expect(await readPayload(await GET(loginRequest()))).toEqual({
        hasAdminAccess: true,
        role,
      });
      expect(guard).toHaveBeenCalledOnce();
      expect(guard.mock.calls[0]?.[0]).toEqual({
        user: { email: 'synthetic@example.com', id: 'synthetic-user', role, tenantId: 'tenant-1' },
      });
      expect(mocks.providerGet).toHaveBeenCalledOnce();
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'tenant_admin'])('keeps the missing-tenant denial for %s', async role => {
    mocks.providerGet.mockResolvedValue(providerSuccess(providerPayload(role)));

    expect(await readPayload(await GET(loginRequest()))).toEqual({ hasAdminAccess: false, role });
    expect(guard).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('keeps the global super-admin exception without a tenant or secondary lookup', async () => {
    mocks.providerGet.mockResolvedValue(providerSuccess(providerPayload('super_admin')));

    expect(await readPayload(await GET(loginRequest()))).toEqual({
      hasAdminAccess: true,
      role: 'super_admin',
    });
    expect(guard).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each(['member', 'staff', 'agent', 'branch_manager', 'unknown'])(
    'does not promote %s through secondary RBAC',
    async role => {
      mocks.providerGet.mockResolvedValue(providerSuccess(providerPayload(role, 'tenant-1')));

      expect(await readPayload(await GET(loginRequest()))).toEqual({ hasAdminAccess: false, role });
      expect(guard).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['a null session', 'null'],
    ['a roleless session', JSON.stringify({ user: { id: 'synthetic-user' } })],
    ['a session without a user', JSON.stringify({ session: { token: 'synthetic-token' } })],
    ['an unreadable success body', 'not-json'],
  ] as [string, string][])('fails closed for %s', async (_label, body) => {
    mocks.providerGet.mockResolvedValue(
      new Response(body, { headers: { 'cache-control': 'no-store' }, status: 200 })
    );

    const response = await GET(loginRequest());

    expect(await readPayload(response)).toEqual({ hasAdminAccess: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(guard).not.toHaveBeenCalled();
  });

  it('propagates a provider failure without reading an admin verdict', async () => {
    const failure = new Error('Synthetic provider failure');
    mocks.providerGet.mockRejectedValueOnce(failure);

    await expect(GET(loginRequest())).rejects.toBe(failure);
    expect(guard).not.toHaveBeenCalled();
  });

  it('waits for the held guard decision without a second provider read', async () => {
    let deny!: (failure: Error) => void;
    guard.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          deny = reject;
        })
    );
    mocks.providerGet.mockResolvedValue(providerSuccess(providerPayload('admin', 'tenant-1')));
    let settled = false;
    const pending = GET(loginRequest()).then(response => {
      settled = true;
      return response;
    });

    await vi.waitFor(() => expect(guard).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    deny(new Error('Synthetic guard denial'));

    expect(await readPayload(await pending)).toEqual({ hasAdminAccess: false, role: 'admin' });
    expect(mocks.providerGet).toHaveBeenCalledOnce();
  });
});
