import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { saveClaimEscalationAgreementCore } from './save-escalation-agreement';

type MockClaimRecord = {
  category: string;
  id: string;
  userId: string;
};

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
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    db: { transaction },
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      category: 'claims.category',
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
  appendEvent: mocks.appendEvent,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) =>
    mocks.db.transaction(cb)
  ),
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

function mockAgreementSaveSelects(options?: {
  agreements?: Array<Record<string, unknown>>;
  claim?: Partial<MockClaimRecord>;
}) {
  mocks.txSelect
    .mockReturnValueOnce(mocks.claimSelectChain)
    .mockReturnValueOnce(mocks.agreementSelectChain);
  mocks.claimSelectChain.limit.mockResolvedValue([
    {
      category: 'vehicle',
      id: 'claim-1',
      userId: 'member-1',
      ...options?.claim,
    },
  ]);
  mocks.agreementSelectChain.limit.mockResolvedValue(options?.agreements ?? []);
}

const authority = mintTestTenantAuthority('tenant-1');

describe('saveClaimEscalationAgreementCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  });

  it('hydrates the member signature timestamp when staff save terms onto an accepted recovery decision row', async () => {
    mockAgreementSaveSelects({
      agreements: [
        {
          acceptedAt: new Date('2026-03-14T09:00:00.000Z'),
          claimId: 'claim-1',
          decisionNextStatus: null,
          decisionReason: 'Recovery decision accepted before commercial terms were saved.',
          feePercentage: null,
          id: 'agreement-1',
          legalActionCapPercentage: null,
          minimumFee: null,
          paymentAuthorizationState: 'pending',
          signedAt: null,
          termsVersion: null,
        },
      ],
    });

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member approved the accepted negotiation path.',
      feePercentage: 20,
      legalActionCapPercentage: 30,
      minimumFee: 25,
      paymentAuthorizationState: 'revoked',
      session: createSession({ userId: 'staff-2', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result.success).toBe(true);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedById: 'staff-2',
        decisionNextStatus: 'negotiation',
        paymentAuthorizationState: 'revoked',
        signedAt: expect.any(Date),
        signedByUserId: 'member-1',
      })
    );
    expect(result.data?.signedAt).toBeTruthy();
  });

  it('blocks escalation agreement saves for guidance-only matters', async () => {
    mockAgreementSaveSelects({
      claim: { category: 'travel' },
    });

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Attempted to move a guidance-only matter into success-fee handling.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error:
        'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.',
    });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});
