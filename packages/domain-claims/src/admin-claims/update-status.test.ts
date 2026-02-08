import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  selectLeftJoin: vi.fn(),
  selectFrom: vi.fn(),
  dbSelect: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  dbUpdate: vi.fn(),
  withTenant: vi.fn((tenantId, tenantColumn, condition) => ({ tenantId, tenantColumn, condition })),
}));

mocks.selectLeftJoin.mockReturnValue({ where: mocks.selectWhere });
mocks.selectFrom.mockReturnValue({ leftJoin: mocks.selectLeftJoin });
mocks.dbSelect.mockReturnValue({ from: mocks.selectFrom });
mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
mocks.dbUpdate.mockReturnValue({ set: mocks.updateSet });

vi.mock('@interdomestik/database', () => ({
  db: {
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenant_id', userId: 'claims.user_id' },
  user: { id: 'user.id', email: 'user.email' },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

import { updateClaimStatusCore } from './update-status';

const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant-1' },
} as never;

describe('admin updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies cross-tenant status update with no mutation', async () => {
    mocks.selectWhere.mockResolvedValueOnce([]);

    await expect(
      updateClaimStatusCore(
        {
          claimId: 'claim-1',
          newStatus: 'resolved',
          session: adminSession,
          requestHeaders: new Headers(),
        },
        {}
      )
    ).rejects.toThrow('Claim not found');

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid status fail-closed with no mutation', async () => {
    await expect(
      updateClaimStatusCore(
        {
          claimId: 'claim-1',
          newStatus: 'not-a-real-status' as never,
          session: adminSession,
          requestHeaders: new Headers(),
        },
        {}
      )
    ).rejects.toThrow('Invalid status');

    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});
