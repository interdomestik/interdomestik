import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { changeClaimAssignment } from '@interdomestik/domain-claims/staff-claims/assign';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignClaim } from '../staff-claims.core';

const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  refusal: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorized }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.refusal }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'wp11-test' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }));
vi.mock('@interdomestik/domain-claims/staff-claims/assign', async original => ({
  ...(await original<typeof import('@interdomestik/domain-claims/staff-claims/assign')>()),
  changeClaimAssignment: vi.fn(),
}));

function signIn(role: string) {
  const authority = mintTestTenantAuthority('tenant-1', { userId: 'actor', role });
  mocks.authorized.mockResolvedValue({
    session: { user: { id: 'actor', role, branchId: 'branch' } },
    authority,
  });
  return authority;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refusal.mockResolvedValue({ success: true });
});

describe('staff assignment action', () => {
  it.each(['admin', 'tenant_admin', 'super_admin', 'member', 'agent', 'branch_manager'])(
    'refuses %s before invoking the assignment command',
    async role => {
      signIn(role);
      await expect(assignClaim('claim-1')).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(changeClaimAssignment).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  );

  it('passes the request authority and headers and refreshes the staff views', async () => {
    const authority = signIn('staff');
    vi.mocked(changeClaimAssignment).mockResolvedValue({
      ok: true,
      changed: true,
      assignment: {
        id: 'claim-1',
        staffId: 'actor',
        assignedById: 'actor',
        assignedAt: new Date(),
      },
    });
    await expect(assignClaim('claim-1')).resolves.toEqual({ success: true });
    const [actualAuthority, input, meta] = vi.mocked(changeClaimAssignment).mock.calls[0];
    expect(actualAuthority).toBe(authority);
    expect(input).toEqual({ claimId: 'claim-1' });
    expect(meta?.requestHeaders?.get('user-agent')).toBe('wp11-test');
    expect(mocks.refresh).toHaveBeenCalledTimes(10);
    expect(mocks.refresh).toHaveBeenCalledWith('/mk/staff/claims/claim-1');
  });
});
