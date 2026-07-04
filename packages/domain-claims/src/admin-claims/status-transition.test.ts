import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  dbTransaction: vi.fn(async callback => callback({ tx: true })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  isNull: vi.fn(value => ({ op: 'isNull', value })),
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
  isNull: mocks.isNull,
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
      expectedCaseLifecycleState: 'submitted',
      expectedLifecycleAuthority: 'lifecycle',
      expectedRecoveryLifecycleState: 'not_started',
      expectedStatus: 'submitted',
      claimId: 'claim-1',
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

  it('uses lifecycle preconditions even when a legacy fallback authority is supplied', async () => {
    await transitionAdminClaimStatus({
      actor: { id: 'admin-1', role: 'admin' },
      expectedCaseLifecycleState: 'submitted',
      expectedLifecycleAuthority: 'status_fallback',
      expectedRecoveryLifecycleState: 'not_started',
      expectedStatus: 'submitted',
      claimId: 'claim-1',
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
  });

  it('layers payment authorization on top of the lifecycle precondition', async () => {
    await transitionAdminClaimStatus({
      actor: { id: 'admin-1', role: 'admin' },
      expectedCaseLifecycleState: 'evaluation',
      expectedLifecycleAuthority: 'status_fallback',
      expectedRecoveryLifecycleState: 'not_started',
      expectedStatus: 'evaluation',
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'court',
    });

    expect(mocks.transition).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        requiredWhereCondition: {
          op: 'and',
          conditions: [
            {
              op: 'and',
              conditions: [
                { op: 'eq', left: 'claims.case_lifecycle_state', right: 'evaluation' },
                { op: 'eq', left: 'claims.recovery_lifecycle_state', right: 'not_started' },
              ],
            },
            { op: 'sql' },
          ],
        },
      })
    );
  });
});
