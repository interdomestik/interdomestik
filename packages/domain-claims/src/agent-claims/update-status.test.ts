import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateClaimStatusCore } from './update-status';

const mocks = vi.hoisted(() => {
  const claimWhere = vi.fn();
  const claimLeftJoin = vi.fn(() => ({ where: claimWhere }));
  const claimFrom = vi.fn(() => ({ leftJoin: claimLeftJoin }));
  return {
    claimWhere,
    dbSelect: vi.fn(() => ({ from: claimFrom })),
    dbUpdate: vi.fn(),
    getPaymentAuthorizationState: vi.fn(),
    transitionClaimStatus: vi.fn(),
    withTenant: vi.fn((tenantId, tenantColumn, condition) => ({
      condition,
      tenantColumn,
      tenantId,
    })),
  };
});

vi.mock('@interdomestik/database', () => ({
  claims: {
    id: 'claims.id',
    staffId: 'claims.staff_id',
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
    title: 'claims.title',
    userId: 'claims.user_id',
  },
  db: {
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
  },
  eq: vi.fn((left, right) => ({ left, right })),
  user: { email: 'user.email', id: 'user.id' },
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

vi.mock('../admin-claims/payment-authorization', () => ({
  getPaymentAuthorizationState: mocks.getPaymentAuthorizationState,
}));

const requestHeaders = new Headers({ 'user-agent': 'Vitest' });
const staffSession = { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } } as never;

function mockClaim(status: string) {
  mocks.claimWhere.mockResolvedValueOnce([
    {
      id: 'claim-1',
      staffId: 'staff-1',
      status,
      title: 'Claim',
      userEmail: 'member@example.com',
      userId: 'member-1',
    },
  ]);
}

function runStatusUpdate(deps = {}, newStatus = 'verification') {
  return updateClaimStatusCore(
    {
      claimId: 'claim-1',
      newStatus,
      requestHeaders,
      session: staffSession,
    },
    deps
  );
}

describe('agent updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'submitted',
      lifecycleVersion: 2,
      status: 'negotiation',
    });
  });

  it('routes agent status changes through the transition command', async () => {
    const logAuditEvent = vi.fn();
    const notifyStatusChanged = vi.fn().mockResolvedValue(undefined);
    mockClaim('submitted');
    mocks.getPaymentAuthorizationState.mockResolvedValueOnce('authorized');

    const result = await runStatusUpdate({ logAuditEvent, notifyStatusChanged }, 'negotiation');

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'staff-1', role: 'staff' },
      claimId: 'claim-1',
      paymentAuthorizationState: 'authorized',
      tenantId: 'tenant-1',
      toStatus: 'negotiation',
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'staff-1',
        action: 'claim.status_changed',
        entityId: 'claim-1',
        headers: requestHeaders,
        metadata: { oldStatus: 'submitted', newStatus: 'negotiation' },
        tenantId: 'tenant-1',
      })
    );
    await vi.waitFor(() =>
      expect(notifyStatusChanged).toHaveBeenCalledWith(
        'member-1',
        'member@example.com',
        { id: 'claim-1', title: 'Claim' },
        'submitted',
        'negotiation'
      )
    );
  });

  it.each([
    ['transition_rejected', 'Invalid status transition'],
    ['invalid_current_status', 'Invalid current claim status'],
  ])('surfaces %s without audit or notification side effects', async (error, expectedError) => {
    const logAuditEvent = vi.fn();
    const notifyStatusChanged = vi.fn();
    mockClaim('evaluation');
    mocks.transitionClaimStatus.mockResolvedValueOnce({ success: false, error });

    const result = await runStatusUpdate({ logAuditEvent, notifyStatusChanged });

    expect(result).toEqual({ success: false, error: expectedError, data: undefined });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(notifyStatusChanged).not.toHaveBeenCalled();
  });
});
