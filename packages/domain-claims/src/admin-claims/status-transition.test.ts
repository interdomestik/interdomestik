import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  dbTransaction: vi.fn(async callback => callback({ tx: true })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  transition: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  claimEscalationAgreements: {
    claimId: 'claim_escalation_agreements.claim_id',
    paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
    tenantId: 'claim_escalation_agreements.tenant_id',
  },
  claims: {
    caseLifecycleState: 'claims.case_lifecycle_state',
    recoveryLifecycleState: 'claims.recovery_lifecycle_state',
    status: 'claims.status',
  },
  db: { transaction: mocks.dbTransaction },
  eq: mocks.eq,
  sql: vi.fn(() => ({ op: 'sql' })),
}));

vi.mock('../claims/transition', () => ({
  transitionClaimStatusInTransaction: mocks.transition,
}));

import { transitionAdminClaimStatus } from './status-transition';

describe('transitionAdminClaimStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transition.mockResolvedValue({
      success: true,
      fromStatus: 'submitted',
      lifecycleVersion: 2,
      status: 'verification',
    });
  });

  it('binds expected lifecycle state instead of legacy status in the precondition', async () => {
    await transitionAdminClaimStatus({
      actor: { id: 'admin-1', role: 'admin' },
      claimId: 'claim-1',
      fromStatus: 'submitted',
      tenantId: 'tenant-1',
      toStatus: 'verification',
    });

    expect(mocks.transition).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        requiredWhereCondition: {
          op: 'and',
          conditions: [
            { op: 'eq', left: 'claims.case_lifecycle_state', right: 'submitted' },
            { op: 'eq', left: 'claims.recovery_lifecycle_state', right: 'not_started' },
          ],
        },
      })
    );
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.status', expect.anything());
  });
});
