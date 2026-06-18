import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const claimLimit = vi.fn();
  const from = vi.fn();
  const insert = vi.fn();
  const onConflictDoUpdate = vi.fn();
  const returning = vi.fn();
  const select = vi.fn();
  const transaction = vi.fn();
  const values = vi.fn();
  const where = vi.fn();
  return {
    claimLimit,
    from,
    insert,
    onConflictDoUpdate,
    returning,
    select,
    transaction,
    values,
    where,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  claimRecoveryNoFeeEvidence: {
    claimId: 'no_fee.claim_id',
    documentedAt: 'no_fee.documented_at',
    documentedById: 'no_fee.documented_by_id',
    id: 'no_fee.id',
    reason: 'no_fee.reason',
    reasonCode: 'no_fee.reason_code',
    tenantId: 'no_fee.tenant_id',
  },
  claims: {
    branchId: 'claim.branch_id',
    id: 'claim.id',
    staffId: 'claim.staff_id',
    tenantId: 'claim.tenant_id',
  },
  db: { transaction: mocks.transaction },
  eq: (left: unknown, right: unknown) => ({ left, right }),
  noFeeEvidenceReasonCodes: ['no_recovery', 'not_billable_under_recovery_scope'],
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: (tenantId: string, tenantColumn: unknown, condition: unknown) => ({
    condition,
    tenantColumn,
    tenantId,
  }),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: (session: { user: { tenantId: string } }) => session.user.tenantId,
}));

import { saveNoFeeEvidenceCore } from './save-no-fee-evidence';

const session = {
  user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
};

describe('saveNoFeeEvidenceCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onConflictDoUpdate.mockImplementation(conflict => ({
      returning: () => mocks.returning(mocks.values.mock.calls.at(-1)?.[0], conflict),
    }));
    mocks.returning.mockResolvedValue([
      {
        claimId: 'claim-1',
        documentedAt: new Date('2026-03-14T09:00:00Z'),
        documentedById: 'staff-1',
        reason: 'member recovery only',
        reasonCode: 'no_recovery',
      },
    ]);
    mocks.claimLimit.mockResolvedValue([{ id: 'claim-1' }]);
    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.onConflictDoUpdate });
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.where.mockReturnValue({ limit: mocks.claimLimit });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.transaction.mockImplementation(async cb =>
      cb({ insert: mocks.insert, select: mocks.select })
    );
  });

  it('upserts no-fee evidence after scoped staff claim access succeeds', async () => {
    const logAuditEvent = vi.fn();

    const result = await saveNoFeeEvidenceCore(
      {
        claimId: 'claim-1',
        reason: 'member recovery only',
        reasonCode: 'no_recovery',
        session,
      },
      { logAuditEvent }
    );

    expect(result).toMatchObject({ success: true, data: { claimId: 'claim-1' } });
    expect(mocks.select).toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalled();
    const [insertValues, conflict] = mocks.returning.mock.calls[0];
    expect(insertValues).toMatchObject({
      tenantId: 'tenant-1',
      claimId: 'claim-1',
      documentedById: 'staff-1',
      reasonCode: 'no_recovery',
    });
    expect(conflict).toMatchObject({
      target: ['no_fee.tenant_id', 'no_fee.claim_id'],
      set: { reasonCode: 'no_recovery', documentedById: 'staff-1' },
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.no_fee_evidence_saved',
        entityId: 'claim-1',
        tenantId: 'tenant-1',
      })
    );
  });

  it('rejects non-staff callers without touching the database', async () => {
    const result = await saveNoFeeEvidenceCore({
      claimId: 'claim-1',
      reasonCode: 'no_recovery',
      session: { user: { ...session.user, role: 'agent' } },
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized', data: undefined });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
