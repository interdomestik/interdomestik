import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockRecoveryDecisionTransaction } from '../claims/recovery-evidence-test-support';
import type { ClaimsSession } from '../claims/types';

const agreementColumns = {
  id: 'claim_escalation_agreements.id',
  tenantId: 'claim_escalation_agreements.tenant_id',
  claimId: 'claim_escalation_agreements.claim_id',
};
const mocks = mockRecoveryDecisionTransaction(agreementColumns);
const { saveRecoveryDecisionCore } = await import('./save-recovery-decision');
function session(role = 'staff'): ClaimsSession {
  return { user: { id: 'staff-1', role, tenantId: 'tenant-1', branchId: 'branch-1' } };
}

function primeScopeAndDecision(existingDecision: unknown[] = []) {
  mocks.txSelect
    .mockReturnValueOnce(mocks.claimSelectChain)
    .mockReturnValueOnce(mocks.agreementSelectChain);
  mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
  mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
  mocks.claimSelectChain.limit.mockReturnValue(mocks.claimSelectChain);
  mocks.claimSelectChain.for.mockResolvedValue([{ id: 'claim-1' }]);
  mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
  mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  mocks.agreementSelectChain.limit.mockResolvedValue(existingDecision);
}

const authority = mintTestTenantAuthority('tenant-1', {
  userId: 'staff-1',
  role: 'staff',
  branchId: 'branch-1',
});

describe('saveRecoveryDecisionCore recovery decision events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits sanitized accepted recovery decision events in the save transaction', async () => {
    primeScopeAndDecision();

    const result = await saveRecoveryDecisionCore({
      authority,
      claimId: 'claim-1',
      decisionType: 'accepted',
      explanation: 'Clear insurer path and viable monetary recovery.',
      session: session(),
    });

    const row = mocks.txInsertValues.mock.calls[0]?.[0];
    expect(result.success).toBe(true);
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ insert: mocks.txInsert, select: mocks.txSelect }),
      expect.objectContaining({
        actor: { id: 'staff-1', role: 'staff' },
        correlationId: 'claim:claim-1:recovery-decision:accepted',
        createdAt: row.acceptedAt,
        eventName: 'recovery.decision_recorded',
        payload: { decisionType: 'accepted', hasExplanation: true },
        tenantId: 'tenant-1',
      })
    );
  });

  it('emits sanitized declined recovery decision events in the save transaction', async () => {
    primeScopeAndDecision([{ id: 'decision-1' }]);

    const result = await saveRecoveryDecisionCore({
      authority,
      claimId: 'claim-1',
      decisionType: 'declined',
      declineReasonCode: 'insufficient_evidence',
      explanation: ' Member needs better evidence. ',
      session: session(),
    });

    const row = (mocks.txUpdateSet.mock.calls[0] as unknown[] | undefined)?.[0] as {
      acceptedAt: Date;
    };
    expect(result.success).toBe(true);
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        correlationId: 'claim:claim-1:recovery-decision:declined',
        createdAt: row.acceptedAt,
        eventName: 'recovery.decision_recorded',
        payload: {
          decisionType: 'declined',
          declineReasonCode: 'insufficient_evidence',
          hasExplanation: true,
        },
      })
    );
  });

  it('does not emit recovery decision events for denied callers or out-of-scope claims', async () => {
    expect(
      await saveRecoveryDecisionCore({
        authority,
        claimId: 'claim-1',
        decisionType: 'accepted',
        session: session('member'),
      })
    ).toEqual({ success: false, error: 'Unauthorized' });

    mocks.txSelect.mockReturnValueOnce(mocks.claimSelectChain);
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.for.mockResolvedValueOnce([]);

    expect(
      await saveRecoveryDecisionCore({
        authority,
        claimId: 'claim-1',
        decisionType: 'accepted',
        session: session(),
      })
    ).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
});
