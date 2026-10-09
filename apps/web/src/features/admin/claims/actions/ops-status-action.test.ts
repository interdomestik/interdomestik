import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpsDomainDenialError } from './ops-action-outcome';

const mocks = vi.hoisted(() => ({
  assertCanMutateClaim: vi.fn(),
  assertTransitionAllowed: vi.fn(),
  getClaimForMutation: vi.fn(),
  getOpsMutationContext: vi.fn(),
  logAudit: vi.fn(),
  revalidateClaim: vi.fn(),
  transitionAdminClaimStatusInTransaction: vi.fn(),
  withTenantContext: vi.fn(),
  tx: { tenantTx: true },
}));

vi.mock('./action-helpers', () => ({
  assertCanMutateClaim: mocks.assertCanMutateClaim,
  assertTransitionAllowed: mocks.assertTransitionAllowed,
  getClaimForMutation: mocks.getClaimForMutation,
  getOpsMutationContext: mocks.getOpsMutationContext,
  logAudit: mocks.logAudit,
  revalidateClaim: mocks.revalidateClaim,
}));

vi.mock('@interdomestik/domain-claims/admin-claims/status-transition', () => ({
  transitionAdminClaimStatus: vi.fn(),
  transitionAdminClaimStatusInTransaction: mocks.transitionAdminClaimStatusInTransaction,
}));

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: mocks.withTenantContext,
}));

import { updateStatusAction } from './ops-status-action';

const opsContext = { actorId: 'admin-1', actorRole: 'admin', tenantId: 'tenant-1' };
const claim = {
  caseLifecycleState: 'evaluation',
  id: 'claim-1',
  recoveryLifecycleState: 'not_started',
  staffId: 'staff-1',
  status: 'evaluation',
};

type TransitionParamOverrides = { toStatus: string; [key: string]: string };

function expectTransitionParams(params: TransitionParamOverrides) {
  expect(mocks.transitionAdminClaimStatusInTransaction).toHaveBeenCalledWith(mocks.tx, {
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
    mocks.getOpsMutationContext.mockResolvedValue(opsContext);
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, action: (tx: unknown) => Promise<unknown>) => action(mocks.tx)
    );
    mocks.getClaimForMutation.mockResolvedValue(claim);
    mocks.transitionAdminClaimStatusInTransaction.mockResolvedValue({
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
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'admin' },
      expect.any(Function)
    );
    expect(mocks.getClaimForMutation).toHaveBeenCalledWith('claim-1', 'tenant-1', mocks.tx);
    expectTransitionParams({ toStatus: 'negotiation' });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      'tenant-1',
      'admin-1',
      'update_status',
      'claim-1',
      { previousStatus: 'evaluation', newStatus: 'negotiation' },
      mocks.tx
    );
    expect(mocks.revalidateClaim).toHaveBeenCalledWith('sq', 'claim-1');
  });

  it('surfaces transition rejection without audit or revalidation side effects', async () => {
    mocks.transitionAdminClaimStatusInTransaction.mockResolvedValueOnce({
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
    mocks.transitionAdminClaimStatusInTransaction.mockResolvedValueOnce({
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

  it('denies non-admin actors before any claim read, transaction or persistence', async () => {
    mocks.getOpsMutationContext.mockResolvedValueOnce(null);

    await expect(updateStatusAction('claim-1', 'verification', 'sq')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.getClaimForMutation).not.toHaveBeenCalled();
    expect(mocks.transitionAdminClaimStatusInTransaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateClaim).not.toHaveBeenCalled();
  });

  it.each(['tenant_admin', 'super_admin'])(
    'lets %s change status on a claim assigned to another staff member',
    async role => {
      mocks.getOpsMutationContext.mockResolvedValueOnce({ ...opsContext, actorRole: role });

      await expect(updateStatusAction('claim-1', 'negotiation', 'sq')).resolves.toEqual({
        success: true,
      });

      expect(mocks.withTenantContext).toHaveBeenCalledWith(
        { tenantId: 'tenant-1', role },
        expect.any(Function)
      );
      expect(mocks.transitionAdminClaimStatusInTransaction).toHaveBeenCalledWith(
        mocks.tx,
        expect.objectContaining({ actor: { id: 'admin-1', role } })
      );
    }
  );

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

  it('rejects an unknown target status before any claim read or transaction', async () => {
    await expect(updateStatusAction('claim-1', 'not_a_status' as never, 'sq')).resolves.toEqual({
      success: false,
      error: 'Invalid status',
    });

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.getClaimForMutation).not.toHaveBeenCalled();
  });

  it('returns a fixed graph-transition denial without transition or audit', async () => {
    mocks.assertTransitionAllowed.mockImplementationOnce(() => {
      throw new OpsDomainDenialError('Illegal transition from evaluation to submitted');
    });

    await expect(updateStatusAction('claim-1', 'submitted', 'sq')).resolves.toEqual({
      success: false,
      error: 'Illegal transition from evaluation to submitted',
    });

    expect(mocks.transitionAdminClaimStatusInTransaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateClaim).not.toHaveBeenCalled();
  });

  it('maps a lifecycle CAS conflict to a fixed safe error', async () => {
    const conflict = new Error(
      'Claim claim-1 changed before the status transition could be saved.'
    );
    conflict.name = 'ClaimTransitionConflictError';
    mocks.transitionAdminClaimStatusInTransaction.mockRejectedValueOnce(conflict);

    await expect(updateStatusAction('claim-1', 'negotiation', 'sq')).resolves.toEqual({
      success: false,
      error: 'This claim changed before the update could be saved. Reload and try again.',
    });
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateClaim).not.toHaveBeenCalled();
  });

  it('sanitizes an unknown in-transaction failure without leaking SQL or PII', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.logAudit.mockRejectedValueOnce(
      new Error('insert into "audit_log" ($1) params: jane.member@example.test')
    );

    const result = await updateStatusAction('claim-1', 'negotiation', 'sq');

    expect(result).toEqual({ success: false, error: 'Action failed. Please try again.' });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('jane.member@example.test');
    expect(logged).not.toContain('audit_log');
    expect(mocks.revalidateClaim).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('keeps a committed status change truthful when revalidation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.revalidateClaim.mockImplementationOnce(() => {
      throw new Error('revalidate failed for /sq/admin/claims/claim-1');
    });

    await expect(updateStatusAction('claim-1', 'negotiation', 'sq')).resolves.toEqual({
      success: true,
      message: 'Saved. Reload the page if the latest state is not shown.',
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.transitionAdminClaimStatusInTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
