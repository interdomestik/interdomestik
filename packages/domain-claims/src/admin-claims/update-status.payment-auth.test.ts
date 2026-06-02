import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agreementFrom: vi.fn(),
  agreementLimit: vi.fn(),
  agreementWhere: vi.fn(),
  claimFrom: vi.fn(),
  claimLeftJoin: vi.fn(),
  claimWhere: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  transitionClaimStatus: vi.fn(),
  withTenant: vi.fn((tenantId, tenantColumn, condition) => ({ tenantId, tenantColumn, condition })),
}));

mocks.claimLeftJoin.mockReturnValue({ where: mocks.claimWhere });
mocks.claimFrom.mockReturnValue({ leftJoin: mocks.claimLeftJoin });
mocks.agreementWhere.mockReturnValue({ limit: mocks.agreementLimit });
mocks.agreementFrom.mockReturnValue({ where: mocks.agreementWhere });
mocks.dbSelect.mockImplementation((fields: { paymentAuthorizationState?: unknown }) =>
  fields.paymentAuthorizationState ? { from: mocks.agreementFrom } : { from: mocks.claimFrom }
);

vi.mock('@interdomestik/database', () => ({
  db: {
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
  },
  claimEscalationAgreements: {
    claimId: 'claim_escalation_agreements.claim_id',
    paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
    tenantId: 'claim_escalation_agreements.tenant_id',
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

vi.mock('../claims/transition', () => ({
  transitionClaimStatus: mocks.transitionClaimStatus,
}));

import { updateClaimStatusCore } from './update-status';

const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant-1' },
} as never;

describe('admin updateClaimStatusCore payment authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimWhere.mockResolvedValue([
      {
        id: 'claim-1',
        title: 'Claim',
        status: 'evaluation',
        userId: 'member-1',
        userEmail: 'member@example.com',
      },
    ]);
    mocks.agreementLimit.mockResolvedValue([{ paymentAuthorizationState: 'authorized' }]);
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 2,
      status: 'negotiation',
    });
  });

  it('passes payment authorization state into payment-gated admin transitions', async () => {
    await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: adminSession,
      requestHeaders: new Headers(),
    });

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.agreementLimit).toHaveBeenCalledWith(1);
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'admin-1', role: 'tenant_admin' },
      claimId: 'claim-1',
      paymentAuthorizationState: 'authorized',
      tenantId: 'tenant-1',
      toStatus: 'negotiation',
    });
  });
});
