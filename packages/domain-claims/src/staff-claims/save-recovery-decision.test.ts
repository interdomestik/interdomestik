import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStaffSessionFixture,
  mockRecoveryDecisionTransaction,
} from '../claims/recovery-evidence-test-support';

const query = {
  claims: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
};
const agreementColumns = {
  id: 'claim_escalation_agreements.id',
  tenantId: 'claim_escalation_agreements.tenant_id',
  claimId: 'claim_escalation_agreements.claim_id',
  decisionType: 'claim_escalation_agreements.decision_type',
  declineReasonCode: 'claim_escalation_agreements.decline_reason_code',
  decisionReason: 'claim_escalation_agreements.decision_reason',
  acceptedById: 'claim_escalation_agreements.accepted_by_id',
  acceptedAt: 'claim_escalation_agreements.accepted_at',
  updatedAt: 'claim_escalation_agreements.updated_at',
  createdAt: 'claim_escalation_agreements.created_at',
};
const mocks = mockRecoveryDecisionTransaction(agreementColumns, query);
const { saveRecoveryDecisionCore } = await import('./save-recovery-decision');
const principal = { userId: 'staff-1', role: 'staff', branchId: 'branch-1' };
const authority = mintTestTenantAuthority('tenant-1', principal);
const staffSession = createStaffSessionFixture(principal);

describe('saveRecoveryDecisionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.claims.findFirst.mockResolvedValue({
      id: 'claim-1',
      title: 'Vehicle claim',
      userId: 'member-1',
    });
    query.user.findFirst.mockResolvedValue({ email: 'member@example.com' });
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.for.mockResolvedValue([
      { id: 'claim-1', userId: 'member-1', title: 'Vehicle claim' },
    ]);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  });

  it.each([
    ['no principal', mintTestTenantAuthority('tenant-1'), staffSession],
    [
      'wrong user',
      mintTestTenantAuthority('tenant-1', { ...principal, userId: 'other' }),
      staffSession,
    ],
    ['wrong tenant', mintTestTenantAuthority('tenant-2', principal), staffSession],
    [
      'wrong role',
      mintTestTenantAuthority('tenant-1', { ...principal, role: 'member' }),
      staffSession,
    ],
    [
      'an injected branch',
      authority,
      createStaffSessionFixture({ ...principal, branchId: 'other' }),
    ],
  ])('rejects %s before opening a transaction', async (_label, capability, session) => {
    const result = await saveRecoveryDecisionCore({
      authority: capability,
      claimId: 'claim-1',
      decisionType: 'accepted',
      session,
    });

    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('rejects injected actor identity in the decision input', async () => {
    const input = { claimId: 'claim-1', decisionType: 'accepted', acceptedById: 'other' } as const;
    const result = await saveRecoveryDecisionCore({ ...input, authority, session: staffSession });

    expect(result).toMatchObject({ success: false });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('creates an accepted recovery-decision snapshot for an in-scope claim', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await saveRecoveryDecisionCore({
      authority,
      claimId: 'claim-1',
      decisionType: 'accepted',
      explanation: 'Clear insurer path and viable monetary recovery.',
      session: staffSession,
    });

    expect(result.success).toBe(true);
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.claimEscalationAgreements);
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        acceptedById: 'staff-1',
        decisionType: 'accepted',
        decisionReason: 'Clear insurer path and viable monetary recovery.',
      })
    );
    expect(result.data).toMatchObject({
      status: 'accepted',
      explanation: 'Clear insurer path and viable monetary recovery.',
      staffLabel: 'Accepted for staff-led recovery',
    });
  });

  it('enqueues the recovery decision in the write transaction with its event id', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await saveRecoveryDecisionCore({
      authority,
      claimId: 'claim-1',
      decisionType: 'accepted',
      session: staffSession,
    });

    expect(result).toMatchObject({ success: true, deliveryIds: ['decision-delivery'] });
    expect(mocks.claimSelectChain.for).toHaveBeenCalledWith('no key update');
    expect(mocks.withTenantContext).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledWith(
      mocks.appendEvent.mock.calls[0][0],
      expect.objectContaining({
        tenantId: 'tenant-1',
        claimId: 'claim-1',
        recipient: { id: 'member-1' },
        decisionDomainEventId: mocks.appendEvent.mock.calls[0][1].id,
      })
    );
  });

  it('lets enqueue failure escape the transaction so the decision rolls back', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);
    const error = new Error('query parameters: synthetic private recovery explanation');
    mocks.enqueue.mockRejectedValueOnce(error);
    const audit = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await saveRecoveryDecisionCore(
        {
          authority,
          claimId: 'claim-1',
          decisionType: 'accepted',
          session: staffSession,
        },
        { logAuditEvent: audit }
      );
      expect(result).toEqual({ success: false, error: 'Failed to save recovery decision' });
      expect(mocks.txInsert).toHaveBeenCalled();
      expect(mocks.enqueue).toHaveBeenCalled();
      await expect(mocks.withTenantContext.mock.results[0].value).rejects.toBe(error);
      expect(audit).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Failed to save recovery decision',
        expect.objectContaining({
          message: 'Failed to save recovery decision',
          cause: { name: 'Error' },
        })
      );
      expect(log.mock.calls[0][1]).not.toBe(error);
    } finally {
      log.mockRestore();
    }
  });

  it('denies saving recovery decisions for claims outside the acting staff scope', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.for.mockResolvedValueOnce([]);

    const result = await saveRecoveryDecisionCore({
      authority,
      claimId: 'claim-1',
      decisionType: 'accepted',
      session: staffSession,
    });

    expect(result).toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });
});
