import type { TenantTransaction } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsVisibilityContext } from '@/features/admin/claims/server/claimVisibility';
import type { GrantedMemberReadScope } from '@/features/admin/members/server/member-read-scope';
import { findClaimIdInTenantContext, findMemberIdInTenantContext } from './tenant-context';

const mocks = vi.hoisted(() => ({
  withTenantAuthority: vi.fn(),
  findClaimIdByNumber: vi.fn(),
  findMemberIdByNumber: vi.fn(),
}));

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withTenantAuthority,
}));
vi.mock('./claim-number-lookup', () => ({ findClaimIdByNumber: mocks.findClaimIdByNumber }));
vi.mock('./member-number-lookup', () => ({ findMemberIdByNumber: mocks.findMemberIdByNumber }));

// Narrow stand-in: the adapter only lends the transaction, it never reads it.
const tx = { query: { marker: 'tenant-tx' } } as unknown as TenantTransaction;
const authority = mintTestTenantAuthority('tenant-access', {
  userId: 'admin-1',
  role: 'tenant_admin',
});
const visibility: ClaimsVisibilityContext = {
  tenantId: 'tenant-access',
  userId: 'admin-1',
  role: 'tenant_admin',
  branchId: null,
};
const claimLookup = { claimNumber: 'CLM-KS-2024-000001', visibility };
const memberLookup = {
  memberNumber: 'MEM-2024-000001',
  scope: { ok: true } as unknown as GrantedMemberReadScope,
};

describe('number resolver tenant context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantAuthority.mockImplementation(
      (_authority: unknown, action: (t: TenantTransaction) => Promise<unknown>) => action(tx)
    );
  });

  it('lends the actual transaction to the claim lookup once, under the exact authority', async () => {
    mocks.findClaimIdByNumber.mockResolvedValue('claim-1');

    await expect(findClaimIdInTenantContext(authority, claimLookup)).resolves.toBe('claim-1');

    expect(mocks.withTenantAuthority).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantAuthority.mock.calls[0][0]).toBe(authority);
    expect(mocks.findClaimIdByNumber).toHaveBeenCalledExactlyOnceWith(tx, claimLookup);
  });

  it('lends the actual transaction to the member lookup once, under the exact authority', async () => {
    mocks.findMemberIdByNumber.mockResolvedValue(null);

    await expect(findMemberIdInTenantContext(authority, memberLookup)).resolves.toBeNull();

    expect(mocks.withTenantAuthority.mock.calls[0][0]).toBe(authority);
    expect(mocks.findMemberIdByNumber).toHaveBeenCalledExactlyOnceWith(tx, memberLookup);
  });

  it('propagates a lookup failure unchanged', async () => {
    const failure = new Error('connection terminated');
    mocks.findClaimIdByNumber.mockRejectedValue(failure);

    await expect(findClaimIdInTenantContext(authority, claimLookup)).rejects.toBe(failure);
  });

  it('propagates a tenant-context failure without running the lookup', async () => {
    const failure = new Error('rls role not ready');
    mocks.withTenantAuthority.mockRejectedValueOnce(failure);

    await expect(findMemberIdInTenantContext(authority, memberLookup)).rejects.toBe(failure);

    expect(mocks.findMemberIdByNumber).not.toHaveBeenCalled();
  });
});
