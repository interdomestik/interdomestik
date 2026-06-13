import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveClaimEscalationAgreementCore } from './save-escalation-agreement';

const mocks = vi.hoisted(() => {
  const claimSelect = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const agreementSelect = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txSelect = vi.fn();
  const transaction = vi.fn(async cb =>
    cb({ insert: txInsert, select: txSelect, update: txUpdate })
  );

  return {
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    claimEscalationAgreements: {
      acceptedAt: 'agreement.accepted_at',
      claimId: 'agreement.claim_id',
      decisionNextStatus: 'agreement.decision_next_status',
      decisionReason: 'agreement.decision_reason',
      feePercentage: 'agreement.fee_percentage',
      id: 'agreement.id',
      legalActionCapPercentage: 'agreement.legal_action_cap_percentage',
      minimumFee: 'agreement.minimum_fee',
      paymentAuthorizationState: 'agreement.payment_authorization_state',
      signedAt: 'agreement.signed_at',
      tenantId: 'agreement.tenant_id',
      termsVersion: 'agreement.terms_version',
    },
    claims: {
      category: 'claims.category',
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      userId: 'claims.user_id',
    },
    db: { transaction },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    agreementSelect,
    claimSelect,
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

function session(role = 'staff') {
  return { user: { id: 'staff-1', role, tenantId: 'tenant-1', branchId: 'branch-1' } };
}

function primeAgreement(existingAgreement: unknown[] = []) {
  mocks.txSelect.mockReturnValueOnce(mocks.claimSelect).mockReturnValueOnce(mocks.agreementSelect);
  mocks.claimSelect.from.mockReturnValue(mocks.claimSelect);
  mocks.claimSelect.where.mockReturnValue(mocks.claimSelect);
  mocks.claimSelect.limit.mockResolvedValue([
    { category: 'vehicle', id: 'claim-1', userId: 'member-1' },
  ]);
  mocks.agreementSelect.from.mockReturnValue(mocks.agreementSelect);
  mocks.agreementSelect.where.mockReturnValue(mocks.agreementSelect);
  mocks.agreementSelect.limit.mockResolvedValue(existingAgreement);
}

function agreementParams(overrides = {}) {
  return {
    claimId: 'claim-1',
    decisionNextStatus: 'negotiation' as const,
    decisionReason: 'Member accepted commercial terms for negotiation.',
    feePercentage: 15,
    legalActionCapPercentage: 25,
    minimumFee: 25,
    paymentAuthorizationState: 'authorized' as const,
    session: session(),
    termsVersion: '2026-03-v1',
    ...overrides,
  };
}

describe('saveClaimEscalationAgreementCore escalation agreement events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits a sanitized escalation agreement event in the insert transaction', async () => {
    primeAgreement();

    const result = await saveClaimEscalationAgreementCore(agreementParams());
    const row = mocks.txInsertValues.mock.calls[0]?.[0];

    expect(result.success).toBe(true);
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ insert: mocks.txInsert, select: mocks.txSelect }),
      expect.objectContaining({
        actor: { id: 'staff-1', role: 'staff' },
        correlationId: 'claim:claim-1:recovery-escalation-agreement:negotiation',
        createdAt: row.acceptedAt,
        eventName: 'recovery.escalation_agreement_recorded',
        payload: {
          decisionNextStatus: 'negotiation',
          feePercentage: 15,
          hasDecisionReason: true,
          hasLegalActionCap: true,
          hasMinimumFee: true,
          paymentAuthorizationState: 'authorized',
        },
        tenantId: 'tenant-1',
      })
    );
  });

  it('emits the event in the update transaction and not on denied paths', async () => {
    primeAgreement([{ id: 'agreement-1', signedAt: new Date('2026-03-11T09:00:00Z') }]);

    expect(
      await saveClaimEscalationAgreementCore(agreementParams({ decisionNextStatus: 'court' }))
    ).toMatchObject({ success: true });
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        correlationId: 'claim:claim-1:recovery-escalation-agreement:court',
      })
    );

    vi.clearAllMocks();
    expect(
      await saveClaimEscalationAgreementCore(agreementParams({ session: session('member') }))
    ).toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
});
