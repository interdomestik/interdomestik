import { describe, expect, it, vi } from 'vitest';

import { upsertRecoveryDecisionRecord } from './recovery-decision-record';

type RecoveryDecisionTx = Parameters<typeof upsertRecoveryDecisionRecord>[0]['tx'];

function recoveryDecisionTx(tx: unknown): RecoveryDecisionTx {
  return tx as RecoveryDecisionTx;
}

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
}));

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  appendEvent: mocks.appendEvent,
  claimEscalationAgreements: {
    acceptedAt: 'claim_escalation_agreements.accepted_at',
    acceptedById: 'claim_escalation_agreements.accepted_by_id',
    claimId: 'claim_escalation_agreements.claim_id',
    createdAt: 'claim_escalation_agreements.created_at',
    decisionReason: 'claim_escalation_agreements.decision_reason',
    decisionType: 'claim_escalation_agreements.decision_type',
    declineReasonCode: 'claim_escalation_agreements.decline_reason_code',
    id: 'claim_escalation_agreements.id',
    tenantId: 'claim_escalation_agreements.tenant_id',
    updatedAt: 'claim_escalation_agreements.updated_at',
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenantId' },
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  eq: mocks.eq,
}));

const actor = { id: 'staff-1', role: 'staff' };

describe('upsertRecoveryDecisionRecord', () => {
  it('appends the recovery decision event through the passed transaction', async () => {
    const insertValues = vi.fn();
    const tx = {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })),
      update: vi.fn(),
    };

    const { decisionDomainEventId } = await upsertRecoveryDecisionRecord({
      claimId: 'claim-1',
      decisionType: 'declined',
      declineReasonCode: 'no_monetary_recovery_path',
      explanation: 'Declined after review',
      actor,
      tenantId: 'tenant-1',
      tx: recoveryDecisionTx(tx),
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        decisionType: 'declined',
        tenantId: 'tenant-1',
      })
    );
    expect(mocks.and).toHaveBeenCalledWith(
      { op: 'eq', left: 'claim_escalation_agreements.tenant_id', right: 'tenant-1' },
      { op: 'eq', left: 'claim_escalation_agreements.claim_id', right: 'claim-1' }
    );
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        id: decisionDomainEventId,
        eventName: 'recovery.decision_recorded',
        tenantId: 'tenant-1',
      })
    );
  });

  it('updates an existing recovery decision through the passed transaction', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn() }));
    const tx = {
      insert: vi.fn(),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'agreement-1' }],
          }),
        }),
      })),
      update: vi.fn(() => ({ set: updateSet })),
    };

    await upsertRecoveryDecisionRecord({
      claimId: 'claim-1',
      decisionType: 'accepted',
      explanation: 'Accepted after review',
      actor,
      tenantId: 'tenant-1',
      tx: recoveryDecisionTx(tx),
    });

    expect(tx.insert).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionReason: 'Accepted after review',
        decisionType: 'accepted',
      })
    );
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventName: 'recovery.decision_recorded' })
    );
  });
});
