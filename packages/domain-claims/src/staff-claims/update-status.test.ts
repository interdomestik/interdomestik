import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { updateClaimStatusCore } from './update-status';

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
  const transaction = vi.fn(async cb =>
    cb({
      insert: txInsert,
      update: txUpdate,
    })
  );

  return {
    db: {
      select: vi.fn(),
      transaction,
    },
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
    },
    claimEscalationAgreements: {
      claimId: 'claim_escalation_agreements.claim_id',
      paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
      signedAt: 'claim_escalation_agreements.signed_at',
    },
    claimStageHistory: {
      id: 'claim_stage_history.id',
      tenantId: 'claim_stage_history.tenant_id',
      claimId: 'claim_stage_history.claim_id',
      fromStatus: 'claim_stage_history.from_status',
      toStatus: 'claim_stage_history.to_status',
      changedById: 'claim_stage_history.changed_by_id',
      changedByRole: 'claim_stage_history.changed_by_role',
      note: 'claim_stage_history.note',
      isPublic: 'claim_stage_history.is_public',
      createdAt: 'claim_stage_history.created_at',
    },
    claimStatusSchema: {
      safeParse: vi.fn((value: { status: string }) => ({
        success: true,
        data: value,
      })),
    },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    isNull: vi.fn(column => ({ op: 'isNull', column })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    claimSelectChain,
    agreementSelectChain,
    txInsertValues,
    txUpdate,
    txUpdateSet,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claimStageHistory: mocks.claimStageHistory,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
  isNull: mocks.isNull,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('../validators/claims', () => ({
  claimStatusSchema: mocks.claimStatusSchema,
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

describe('staff updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  });

  it('blocks negotiation until a signed, authorized escalation agreement exists', async () => {
    mocks.db.select
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', status: 'evaluation' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error:
        'Signed escalation agreement and authorized payment collection are required before staff-led recovery can begin',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('blocks negotiation when payment authorization is still pending', async () => {
    mocks.db.select
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', status: 'evaluation' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        claimId: 'claim-1',
        paymentAuthorizationState: 'pending',
        signedAt: new Date('2026-03-11T09:00:00Z'),
      },
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error:
        'Signed escalation agreement and authorized payment collection are required before staff-led recovery can begin',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('allows recovery status transition when an authorized agreement is present', async () => {
    mocks.db.select
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', status: 'evaluation' }]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        claimId: 'claim-1',
        paymentAuthorizationState: 'authorized',
        signedAt: new Date('2026-03-11T09:00:00Z'),
      },
    ]);
    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      note: 'member signed the agreement',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'negotiation',
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        fromStatus: 'evaluation',
        toStatus: 'negotiation',
      })
    );
  });

  it('records an audit event when staff decline a recovery matter', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mocks.db.select.mockReturnValueOnce(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', status: 'negotiation' }]);

    const result = await updateClaimStatusCore(
      {
        claimId: 'claim-1',
        newStatus: 'rejected',
        note: 'Declined after review',
        requestHeaders,
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.status_changed',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: 'claim-1',
        entityType: 'claim',
        headers: requestHeaders,
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          oldStatus: 'negotiation',
          newStatus: 'rejected',
          note: 'Declined after review',
        }),
      })
    );
  });
});
