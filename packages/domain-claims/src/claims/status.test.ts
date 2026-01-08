import { describe, expect, it, vi } from 'vitest';

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

import { updateClaimStatusCore } from './status';

describe('updateClaimStatusCore', () => {
  it('rejects when claim is not found in tenant scope', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'claims.id', tenantId: 'claims.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return null;
    });

    const result = await updateClaimStatusCore({
      session: { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      newStatus: 'submitted',
    });

    expect(result).toEqual({ error: 'Claim not found' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'claims.tenant_id',
      expect.any(Object)
    );
  });

  it('rejects invalid status', async () => {
    const result = await updateClaimStatusCore({
      session: { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      newStatus: 'invalid-status',
    });

    expect(result).toEqual({ error: 'Invalid status' });
  });

  it('rejects unauthorized user (member)', async () => {
    const result = await updateClaimStatusCore({
      session: { user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' } } as never,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      newStatus: 'submitted',
    });

    expect(result).toEqual({ error: 'Unauthorized' });
  });

  it('successfully updates status', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'claim-1',
      status: 'draft',
      userId: 'member-1',
      title: 'Test Claim',
      tenantId: 'tenant-1',
    });
    mocks.withTenant.mockReturnValue({ scoped: true });

    const result = await updateClaimStatusCore(
      {
        session: { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } } as never,
        requestHeaders: new Headers(),
        claimId: 'claim-1',
        newStatus: 'submitted',
      },
      {
        logAuditEvent: vi.fn(),
        notifyStatusChanged: vi.fn(),
        revalidatePath: vi.fn(),
      }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith({
      status: 'submitted',
      updatedAt: expect.any(Date),
    });
  });
});
