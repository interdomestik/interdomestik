import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { saveClaimEscalationAgreementCore } from './save-escalation-agreement';

const mocks = vi.hoisted(() => {
  const claimSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const agreementSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txSelect = vi.fn();
  const transaction = vi.fn(async cb =>
    cb({
      insert: txInsert,
      select: txSelect,
      update: txUpdate,
    })
  );

  return {
    db: {
      transaction,
    },
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      userId: 'claims.user_id',
    },
    claimEscalationAgreements: {
      id: 'claim_escalation_agreements.id',
      tenantId: 'claim_escalation_agreements.tenant_id',
      claimId: 'claim_escalation_agreements.claim_id',
      decisionNextStatus: 'claim_escalation_agreements.decision_next_status',
      decisionReason: 'claim_escalation_agreements.decision_reason',
      feePercentage: 'claim_escalation_agreements.fee_percentage',
      minimumFee: 'claim_escalation_agreements.minimum_fee',
      legalActionCapPercentage: 'claim_escalation_agreements.legal_action_cap_percentage',
      paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
      termsVersion: 'claim_escalation_agreements.terms_version',
      signedAt: 'claim_escalation_agreements.signed_at',
      acceptedAt: 'claim_escalation_agreements.accepted_at',
      acceptedById: 'claim_escalation_agreements.accepted_by_id',
      signedByUserId: 'claim_escalation_agreements.signed_by_user_id',
      updatedAt: 'claim_escalation_agreements.updated_at',
    },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    claimSelectChain,
    agreementSelectChain,
    txInsert,
    txInsertValues,
    txSelect,
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

function createSession(options: {
  userId: string;
  branchId?: string | null;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  const user = {
    id: options.userId,
    role: options.role ?? 'staff',
    tenantId: options.tenantId ?? 'tenant-1',
  };

  if (options.branchId === undefined) {
    return { user } as unknown as ClaimsSession;
  }

  return {
    user: { ...user, branchId: options.branchId },
  } as unknown as ClaimsSession;
}

describe('saveClaimEscalationAgreementCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  });

  it('rejects unauthorized callers', async () => {
    const result = await saveClaimEscalationAgreementCore({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member reviewed and accepted the negotiation path.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'member-1', role: 'member' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('validates the commercial cap against the agreed fee percentage', async () => {
    const result = await saveClaimEscalationAgreementCore({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member approved the recovery path.',
      feePercentage: 25,
      legalActionCapPercentage: 15,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Legal-action cap must be greater than or equal to the agreed fee percentage',
    });
  });

  it('creates a new escalation agreement snapshot for an in-scope claim', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', userId: 'member-1' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await saveClaimEscalationAgreementCore({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted commercial terms for negotiation.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result.success).toBe(true);
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.claimEscalationAgreements);
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        acceptedById: 'staff-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member accepted commercial terms for negotiation.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedByUserId: 'member-1',
        termsVersion: '2026-03-v1',
      })
    );
    expect(result.data).toMatchObject({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted commercial terms for negotiation.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: '25.00',
      paymentAuthorizationState: 'authorized',
      termsVersion: '2026-03-v1',
    });
  });

  it('records a commercial audit event when staff save recovery terms', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', userId: 'member-1' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await saveClaimEscalationAgreementCore(
      {
        claimId: 'claim-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member accepted commercial terms for negotiation.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: 25,
        paymentAuthorizationState: 'authorized',
        requestHeaders,
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        termsVersion: '2026-03-v1',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result.success).toBe(true);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.commercial_terms_saved',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: 'claim-1',
        entityType: 'claim',
        headers: requestHeaders,
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          decisionNextStatus: 'negotiation',
          decisionReason: 'Member accepted commercial terms for negotiation.',
          decisionType: 'accepted',
          feePercentage: 15,
          legalActionCapPercentage: 25,
          minimumFee: '25.00',
          paymentAuthorizationState: 'authorized',
          termsVersion: '2026-03-v1',
        }),
      })
    );
  });

  it('refreshes acceptance audit fields when staff resave an agreement', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', userId: 'member-1' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        acceptedAt: new Date('2026-03-11T09:00:00.000Z'),
        claimId: 'claim-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Initial negotiation path was accepted.',
        feePercentage: 15,
        id: 'agreement-1',
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedAt: new Date('2026-03-11T09:00:00.000Z'),
        termsVersion: '2026-03-v1',
      },
    ]);

    const result = await saveClaimEscalationAgreementCore({
      claimId: 'claim-1',
      decisionNextStatus: 'court',
      decisionReason: 'Member requested escalation directly into the court path.',
      feePercentage: 20,
      legalActionCapPercentage: 30,
      minimumFee: 40,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-2', branchId: 'branch-1' }),
      termsVersion: '2026-03-v2',
    });

    expect(result.success).toBe(true);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedAt: expect.any(Date),
        acceptedById: 'staff-2',
        decisionNextStatus: 'court',
        decisionReason: 'Member requested escalation directly into the court path.',
        feePercentage: 20,
        legalActionCapPercentage: 30,
        minimumFee: '40.00',
        paymentAuthorizationState: 'authorized',
        termsVersion: '2026-03-v2',
        updatedAt: expect.any(Date),
      })
    );
    expect(result.data).toMatchObject({
      claimId: 'claim-1',
      decisionNextStatus: 'court',
      decisionReason: 'Member requested escalation directly into the court path.',
      feePercentage: 20,
      legalActionCapPercentage: 30,
      minimumFee: '40.00',
      paymentAuthorizationState: 'authorized',
      signedAt: '2026-03-11T09:00:00.000Z',
      termsVersion: '2026-03-v2',
    });
    expect(result.data?.acceptedAt).not.toBe('2026-03-11T09:00:00.000Z');
  });
});
