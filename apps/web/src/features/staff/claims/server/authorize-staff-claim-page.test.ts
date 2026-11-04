import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ getCachedSession: vi.fn() }));

// The real session producer and staff reader policy run; only the session lookup is stubbed.
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: hoisted.getCachedSession }));

import { authorizeStaffClaimPage } from './authorize-staff-claim-page';

const pageUser = { id: 'user-1', role: 'branch_manager', branchId: 'branch-a' };

function cachedSession(user: Record<string, unknown>) {
  return { user: { id: 'user-1', tenantId: 'tenant_ks', agentId: null, ...user } };
}

describe('authorizeStaffClaimPage', () => {
  beforeEach(() => {
    hoisted.getCachedSession.mockReset();
  });

  it('returns the authority when its reader is the rendered user, role and branch', async () => {
    hoisted.getCachedSession.mockResolvedValue(
      cachedSession({ role: 'branch_manager', branchId: 'branch-a' })
    );
    await expect(authorizeStaffClaimPage(pageUser)).resolves.not.toBeNull();
  });

  it('accepts a branchless staff reader for a branchless staff page user', async () => {
    hoisted.getCachedSession.mockResolvedValue(cachedSession({ role: 'staff', branchId: null }));
    await expect(
      authorizeStaffClaimPage({ id: 'user-1', role: 'staff', branchId: undefined })
    ).resolves.not.toBeNull();
  });

  it.each([
    ['role', { role: 'staff', branchId: 'branch-a' }],
    ['branch', { role: 'branch_manager', branchId: 'branch-b' }],
    ['missing branch', { role: 'branch_manager', branchId: null }],
    ['role and branch', { role: 'staff', branchId: 'branch-b' }],
  ])('denies when the authority session diverges from the page on %s', async (_, user) => {
    hoisted.getCachedSession.mockResolvedValue(cachedSession(user));
    await expect(authorizeStaffClaimPage(pageUser)).resolves.toBeNull();
  });

  it('denies when the authority session is another user', async () => {
    hoisted.getCachedSession.mockResolvedValue({
      user: { id: 'user-2', tenantId: 'tenant_ks', role: 'branch_manager', branchId: 'branch-a' },
    });
    await expect(authorizeStaffClaimPage(pageUser)).resolves.toBeNull();
  });

  it('denies a role without staff claim surfaces even when the page agrees', async () => {
    hoisted.getCachedSession.mockResolvedValue(cachedSession({ role: 'member', branchId: null }));
    await expect(
      authorizeStaffClaimPage({ id: 'user-1', role: 'member', branchId: null })
    ).resolves.toBeNull();
  });

  it('denies an unauthenticated or tenantless request', async () => {
    hoisted.getCachedSession.mockResolvedValue(null);
    await expect(authorizeStaffClaimPage(pageUser)).resolves.toBeNull();
    hoisted.getCachedSession.mockResolvedValue({ user: { id: 'user-1', role: 'staff' } });
    await expect(authorizeStaffClaimPage(pageUser)).resolves.toBeNull();
  });

  it('propagates other authorization failures', async () => {
    hoisted.getCachedSession.mockRejectedValue(new Error('session store unavailable'));
    await expect(authorizeStaffClaimPage(pageUser)).rejects.toThrow('session store unavailable');
  });
});
