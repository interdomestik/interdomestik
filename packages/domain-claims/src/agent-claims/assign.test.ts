import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
mocks.update.mockReturnValue({ set: mocks.updateSet });

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: mocks.findFirst },
      user: { findFirst: vi.fn() },
    },
    update: mocks.update,
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenant_id' },
  user: { id: 'user.id', tenantId: 'user.tenant_id' },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

import { assignClaimCore } from './assign';

const baseSession = {
  user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
};

describe('assignClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes claim lookup with tenant filter', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'claims.id', tenantId: 'claims.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return null;
    });

    const result = await assignClaimCore({
      claimId: 'claim-1',
      staffId: null,
      session: baseSession as never,
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found', data: undefined });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'claims.tenant_id',
      expect.any(Object)
    );
  });

  it('prevents staff from assigning other staff', async () => {
    const result = await assignClaimCore({
      claimId: 'claim-1',
      staffId: 'other-staff-id',
      session: baseSession as never, // Role is staff
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({ success: false, error: 'Access denied: Cannot assign other staff' });
  });

  it('allows admin to assign any staff', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'claim-1' });
    // Mock staff member for notification lookup
    const userQueries = (await import('@interdomestik/database')).db.query.user;
    (userQueries.findFirst as any).mockResolvedValue({
      id: 'other-staff-id',
      email: 'staff@example.com',
      name: 'Staff',
    });

    const result = await assignClaimCore({
      claimId: 'claim-1',
      staffId: 'other-staff-id',
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({ success: true });
  });

  it('denies cross-tenant assignment with a generic error and no mutation', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      staffId: 'staff-2',
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found', data: undefined });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects invalid assignee input fail-closed with no mutation', async () => {
    const result = await assignClaimCore({
      claimId: 'claim-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      staffId: { bad: true } as any,
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({ success: false, error: 'Invalid staff assignment', data: undefined });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('fails closed when assignee is missing and does not mutate', async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 'claim-1' });
    const userQueries = (await import('@interdomestik/database')).db.query.user;
    (userQueries.findFirst as any).mockResolvedValueOnce(null);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      staffId: 'missing-staff',
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({ success: false, error: 'Staff member not found', data: undefined });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
