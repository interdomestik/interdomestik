import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  selectLeftJoin: vi.fn(),
  selectFrom: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  transitionClaimStatus: vi.fn(),
  withTenant: vi.fn((tenantId, tenantColumn, condition) => ({ tenantId, tenantColumn, condition })),
}));

mocks.selectLeftJoin.mockReturnValue({ where: mocks.selectWhere });
mocks.selectFrom.mockReturnValue({ leftJoin: mocks.selectLeftJoin });
mocks.dbSelect.mockReturnValue({ from: mocks.selectFrom });

vi.mock('@interdomestik/database', () => ({
  db: {
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenant_id', userId: 'claims.user_id' },
  claimEscalationAgreements: {},
  user: { id: 'user.id', email: 'user.email' },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('../claims/transition', () => ({
  transitionClaimStatus: mocks.transitionClaimStatus,
}));

import { updateClaimStatusCore } from './update-status';

const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant-1' },
} as never;

const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

function mockClaim(status: string) {
  mocks.selectWhere.mockResolvedValueOnce([
    {
      id: 'claim-1',
      title: 'Claim',
      status,
      userId: 'member-1',
      userEmail: 'member@example.com',
    },
  ]);
}

function runStatusUpdate(
  newStatus: Parameters<typeof updateClaimStatusCore>[0]['newStatus'],
  deps = {}
) {
  return updateClaimStatusCore(
    {
      claimId: 'claim-1',
      newStatus,
      session: adminSession,
      requestHeaders,
    },
    deps
  );
}

describe('admin updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'verification',
      lifecycleVersion: 2,
      status: 'resolved',
    });
  });

  it('preserves invalid, cross-tenant, and no-op behavior before the command', async () => {
    await expect(runStatusUpdate('not-a-real-status' as never)).rejects.toThrow('Invalid status');

    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.selectWhere.mockResolvedValueOnce([]);

    await expect(runStatusUpdate('resolved')).rejects.toThrow('Claim not found');

    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockClaim('resolved');

    await runStatusUpdate('resolved');

    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();
  });

  it('routes admin status changes through the transition command', async () => {
    const logAuditEvent = vi.fn();
    mockClaim('submitted');

    await runStatusUpdate('resolved', { logAuditEvent });

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'admin-1', role: 'tenant_admin' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'resolved',
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'claim.status_changed',
        entityId: 'claim-1',
        headers: requestHeaders,
        metadata: { oldStatus: 'verification', newStatus: 'resolved' },
      })
    );
  });

  it('surfaces transition command rejection without audit or notification side effects', async () => {
    const logAuditEvent = vi.fn();
    const notifyStatusChanged = vi.fn();
    mockClaim('evaluation');
    mocks.transitionClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'transition_rejected',
    });

    await expect(
      runStatusUpdate('resolved', { logAuditEvent, notifyStatusChanged })
    ).rejects.toThrow('Invalid status transition');

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(notifyStatusChanged).not.toHaveBeenCalled();
  });
});
