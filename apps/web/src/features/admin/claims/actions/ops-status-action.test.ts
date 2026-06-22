import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCanMutateClaim: vi.fn(),
  assertTransitionAllowed: vi.fn(),
  getActionSession: vi.fn(),
  getClaimForMutation: vi.fn(),
  logAudit: vi.fn(),
  revalidateClaim: vi.fn(),
  transitionAdminClaimStatus: vi.fn(),
}));

vi.mock('./action-helpers', () => ({
  assertCanMutateClaim: mocks.assertCanMutateClaim,
  assertTransitionAllowed: mocks.assertTransitionAllowed,
  getActionSession: mocks.getActionSession,
  getClaimForMutation: mocks.getClaimForMutation,
  logAudit: mocks.logAudit,
  revalidateClaim: mocks.revalidateClaim,
}));

vi.mock('@interdomestik/domain-claims/admin-claims/status-transition', () => ({
  transitionAdminClaimStatus: mocks.transitionAdminClaimStatus,
}));

import { updateStatusAction } from './ops-status-action';

const session = { user: { id: 'admin-1', role: 'admin' } };
const claim = {
  caseLifecycleState: 'evaluation',
  id: 'claim-1',
  recoveryLifecycleState: 'not_started',
  staffId: 'staff-1',
  status: 'evaluation',
};

type TransitionParamOverrides = { toStatus: string; [key: string]: string };

function expectTransitionParams(params: TransitionParamOverrides) {
  expect(mocks.transitionAdminClaimStatus).toHaveBeenCalledWith({
    actor: { id: 'admin-1', role: 'admin' },
    expectedCaseLifecycleState: params.expectedCaseLifecycleState ?? 'evaluation',
    expectedLifecycleAuthority: params.expectedLifecycleAuthority ?? 'lifecycle',
    expectedRecoveryLifecycleState: params.expectedRecoveryLifecycleState ?? 'not_started',
    expectedStatus: params.expectedStatus ?? 'evaluation',
    claimId: 'claim-1',
    tenantId: 'tenant-1',
    toStatus: params.toStatus,
  });
}

describe('updateStatusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionSession.mockResolvedValue({ session, tenantId: 'tenant-1' });
    mocks.getClaimForMutation.mockResolvedValue(claim);
    mocks.transitionAdminClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 4,
      status: 'negotiation',
    });
  });

  it('routes admin ops status changes through the transition command', async () => {
    await expect(updateStatusAction('claim-1', 'negotiation', 'sq')).resolves.toEqual({
      success: true,
    });

    expect(mocks.assertCanMutateClaim).toHaveBeenCalledWith(claim, 'admin', 'status_change');
    expect(mocks.assertTransitionAllowed).toHaveBeenCalledWith('evaluation', 'negotiation');
    expectTransitionParams({ toStatus: 'negotiation' });
    expect(mocks.logAudit).toHaveBeenCalledWith('tenant-1', 'admin-1', 'update_status', 'claim-1', {
      previousStatus: 'evaluation',
      newStatus: 'negotiation',
    });
    expect(mocks.revalidateClaim).toHaveBeenCalledWith('sq', 'claim-1');
  });

  it('surfaces transition rejection without audit or revalidation side effects', async () => {
    mocks.transitionAdminClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'transition_rejected',
    });

    await expect(updateStatusAction('claim-1', 'negotiation', 'sq')).resolves.toEqual({
      success: false,
      error: 'Illegal transition from evaluation to negotiation',
    });

    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateClaim).not.toHaveBeenCalled();
  });

  it('binds payment-gated status changes to the originally authorized status', async () => {
    mocks.transitionAdminClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'payment_authorization_required',
    });

    await expect(updateStatusAction('claim-1', 'court', 'sq')).resolves.toEqual({
      success: false,
      error: 'Illegal transition from evaluation to court',
    });

    expectTransitionParams({ toStatus: 'court' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateClaim).not.toHaveBeenCalled();
  });

  it('preserves the assigned-owner status-change rule before persistence', async () => {
    mocks.getActionSession.mockResolvedValueOnce({
      session: { user: { id: 'staff-2', role: 'staff' } },
      tenantId: 'tenant-1',
    });

    await expect(updateStatusAction('claim-1', 'verification', 'sq')).resolves.toEqual({
      success: false,
      error: 'Only the assigned owner can update the status.',
    });

    expect(mocks.transitionAdminClaimStatus).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('passes fallback authority for legacy null lifecycle rows', async () => {
    const legacyClaim = {
      ...claim,
      caseLifecycleState: null,
      recoveryLifecycleState: null,
      status: 'submitted',
    };
    mocks.getClaimForMutation.mockResolvedValueOnce(legacyClaim);

    await expect(updateStatusAction('claim-1', 'verification', 'sq')).resolves.toEqual({
      success: true,
    });

    expect(mocks.assertTransitionAllowed).toHaveBeenCalledWith('submitted', 'verification');
    expectTransitionParams({
      expectedCaseLifecycleState: 'submitted',
      expectedLifecycleAuthority: 'status_fallback',
      expectedRecoveryLifecycleState: 'not_started',
      expectedStatus: 'submitted',
      toStatus: 'verification',
    });
  });
});
