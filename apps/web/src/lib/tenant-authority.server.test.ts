import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCachedSession: vi.fn(),
}));

vi.mock('./auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('./auth.server', () => ({ getCachedSession: hoisted.getCachedSession }));

import { authorizeSessionTenant, authorizeSessionUserTenant } from './tenant-authority.server';

const session = {
  user: {
    id: 'user-1',
    role: 'branch_manager',
    tenantId: 'tenant-home',
    accessTenantId: 'tenant-access',
    branchId: 'branch-1',
    agentId: null,
  },
};

describe('authorizeSessionTenant', () => {
  beforeEach(() => {
    hoisted.getSession.mockReset();
    hoisted.getCachedSession.mockReset();
  });

  it('returns null for an unauthenticated request', async () => {
    hoisted.getCachedSession.mockResolvedValue(null);
    await expect(authorizeSessionTenant()).resolves.toBeNull();
    hoisted.getCachedSession.mockResolvedValue({ user: null });
    await expect(authorizeSessionTenant()).resolves.toBeNull();
  });

  it('throws MissingTenantError for an authenticated session without a tenant', async () => {
    hoisted.getCachedSession.mockResolvedValue({ user: { id: 'user-1', role: 'member' } });
    await expect(authorizeSessionTenant()).rejects.toMatchObject({ name: 'MissingTenantError' });
  });

  it('mints the session access tenant and principal, and nothing a caller supplies', async () => {
    hoisted.getCachedSession.mockResolvedValue(session);
    const authorized = await authorizeSessionTenant();
    expect(authorized?.session).toBe(session);
    expect(readTenantAuthority(authorized!.authority)).toMatchObject({
      tenantId: 'tenant-access',
      accessTenantId: 'tenant-access',
      purpose: 'session',
      principal: { userId: 'user-1', role: 'branch_manager', branchId: 'branch-1', agentId: null },
    });
    expect(Object.isFrozen(authorized)).toBe(true);
  });

  it('authenticates the headers a request wrapper already read', async () => {
    const requestHeaders = new Headers({ cookie: 'session=abc' });
    hoisted.getSession.mockResolvedValue(session);
    const authorized = await authorizeSessionTenant(requestHeaders);
    expect(hoisted.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(hoisted.getCachedSession).not.toHaveBeenCalled();
    expect(readTenantAuthority(authorized!.authority).tenantId).toBe('tenant-access');
  });

  it('gives each request its own authority', async () => {
    hoisted.getCachedSession.mockResolvedValue(session);
    const first = await authorizeSessionTenant();
    const second = await authorizeSessionTenant();
    expect(first!.authority).not.toBe(second!.authority);
  });
});

describe('authorizeSessionUserTenant', () => {
  beforeEach(() => {
    hoisted.getCachedSession.mockReset();
  });

  it("returns the session authority only for the session's own user", async () => {
    hoisted.getCachedSession.mockResolvedValue(session);
    const authority = await authorizeSessionUserTenant('user-1');
    expect(readTenantAuthority(authority!).principal?.userId).toBe('user-1');
    await expect(authorizeSessionUserTenant('user-2')).resolves.toBeNull();
  });

  it('returns null for an unauthenticated request or a session without a tenant', async () => {
    hoisted.getCachedSession.mockResolvedValue(null);
    await expect(authorizeSessionUserTenant('user-1')).resolves.toBeNull();
    hoisted.getCachedSession.mockResolvedValue({ user: { id: 'user-1', role: 'member' } });
    await expect(authorizeSessionUserTenant('user-1')).resolves.toBeNull();
  });

  it('propagates session failures other than a missing tenant', async () => {
    hoisted.getCachedSession.mockRejectedValue(new Error('session store down'));
    await expect(authorizeSessionUserTenant('user-1')).rejects.toThrow('session store down');
  });
});
