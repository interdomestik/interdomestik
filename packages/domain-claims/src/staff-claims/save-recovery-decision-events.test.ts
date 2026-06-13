import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { saveRecoveryDecisionCore } from './save-recovery-decision';

const mocks = vi.hoisted(() => {
  const chain = () => ({ from: vi.fn(), where: vi.fn(), limit: vi.fn() });
  const claimSelect = chain();
  const decisionSelect = chain();
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txSelect = vi.fn();
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const transaction = vi.fn(async cb =>
    cb({ insert: txInsert, select: txSelect, update: txUpdate })
  );

  return {
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    claimEscalationAgreements: {
      id: 'claim_escalation_agreements.id',
      tenantId: 'claim_escalation_agreements.tenant_id',
      claimId: 'claim_escalation_agreements.claim_id',
    },
    claims: { id: 'claims.id', tenantId: 'claims.tenant_id' },
    db: { transaction },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    claimSelect,
    decisionSelect,
    txInsert,
    txInsertValues,
    txSelect,
    txUpdate,
    txUpdateSet,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  appendEvent: mocks.appendEvent,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

function session(role = 'staff'): ClaimsSession {
  return { user: { id: 'staff-1', role, tenantId: 'tenant-1', branchId: 'branch-1' } };
}

function primeScopeAndDecision(existingDecision: unknown[] = []) {
  mocks.txSelect.mockReturnValueOnce(mocks.claimSelect).mockReturnValueOnce(mocks.decisionSelect);
  mocks.claimSelect.from.mockReturnValue(mocks.claimSelect);
  mocks.claimSelect.where.mockReturnValue(mocks.claimSelect);
  mocks.claimSelect.limit.mockResolvedValue([{ id: 'claim-1' }]);
  mocks.decisionSelect.from.mockReturnValue(mocks.decisionSelect);
  mocks.decisionSelect.where.mockReturnValue(mocks.decisionSelect);
  mocks.decisionSelect.limit.mockResolvedValue(existingDecision);
}

describe('saveRecoveryDecisionCore recovery decision events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits sanitized accepted recovery decision events in the save transaction', async () => {
    primeScopeAndDecision();

    const result = await saveRecoveryDecisionCore({
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
        claimId: 'claim-1',
        decisionType: 'accepted',
        session: session('member'),
      })
    ).toEqual({ success: false, error: 'Unauthorized' });

    mocks.txSelect.mockReturnValueOnce(mocks.claimSelect);
    mocks.claimSelect.from.mockReturnValue(mocks.claimSelect);
    mocks.claimSelect.where.mockReturnValue(mocks.claimSelect);
    mocks.claimSelect.limit.mockResolvedValue([]);

    expect(
      await saveRecoveryDecisionCore({
        claimId: 'claim-1',
        decisionType: 'accepted',
        session: session(),
      })
    ).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
});
