import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { saveRecoveryDecisionCore } from './save-recovery-decision';

function createSelectChain() {
  return {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
}

const mocks = vi.hoisted(() => {
  const claimSelectChain = createSelectChain();
  const agreementSelectChain = createSelectChain();
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txSelect = vi.fn();
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
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
    },
    claimEscalationAgreements: {
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

describe('saveRecoveryDecisionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  });

  it('rejects unauthorized callers', async () => {
    const result = await saveRecoveryDecisionCore({
      claimId: 'claim-1',
      decisionType: 'accepted',
      session: createSession({ userId: 'member-1', role: 'member' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('creates an accepted recovery-decision snapshot for an in-scope claim', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await saveRecoveryDecisionCore({
      claimId: 'claim-1',
      decisionType: 'accepted',
      explanation: 'Clear insurer path and viable monetary recovery.',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
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
});
