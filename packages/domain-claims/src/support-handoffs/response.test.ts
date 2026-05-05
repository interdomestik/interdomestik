import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupportHandoffSession } from './types';
import { ACTIVE_HANDOFF_STATUSES, MAX_PUBLIC_RESPONSE_LENGTH } from './types';
import { getMemberLatestPublicResponse, updateSupportHandoffPublicResponseCore } from './response';

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    db: {
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    },
    desc: vi.fn(column => ({ column, op: 'desc' })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    inArray: vi.fn((left, right) => ({ left, op: 'inArray', right })),
    isNotNull: vi.fn(column => ({ column, op: 'isNotNull' })),
    logAuditEvent: vi.fn(),
    selectFrom,
    selectLimit,
    selectOrderBy,
    selectWhere,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    supportHandoffs: {
      branchId: 'support_handoffs.branch_id',
      claimId: 'support_handoffs.claim_id',
      id: 'support_handoffs.id',
      memberId: 'support_handoffs.member_id',
      publicResponse: 'support_handoffs.public_response',
      publicResponseAt: 'support_handoffs.public_response_at',
      publicResponseAcknowledgedAt: 'support_handoffs.public_response_acknowledged_at',
      publicResponseAcknowledgedById: 'support_handoffs.public_response_acknowledged_by_id',
      publicResponseAcknowledgedVersion: 'support_handoffs.public_response_acknowledged_version',
      publicResponseById: 'support_handoffs.public_response_by_id',
      publicResponseVersion: 'support_handoffs.public_response_version',
      staffId: 'support_handoffs.staff_id',
      status: 'support_handoffs.status',
      tenantId: 'support_handoffs.tenant_id',
      updatedAt: 'support_handoffs.updated_at',
    },
    updateReturning,
    updateSet,
    updateWhere,
    withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  db: mocks.db,
  desc: mocks.desc,
  eq: mocks.eq,
  sql: mocks.sql,
  supportHandoffs: mocks.supportHandoffs,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('drizzle-orm', () => ({
  inArray: mocks.inArray,
  isNotNull: mocks.isNotNull,
}));

function staffSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: {
      branchId: 'branch-1',
      id: 'staff-1',
      role: 'staff',
      tenantId: 'tenant-1',
      ...overrides,
    },
  } as SupportHandoffSession;
}

describe('support handoff public response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([
      {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
    ]);
    mocks.db.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
    mocks.selectOrderBy.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLimit.mockResolvedValue([]);
  });

  it('rejects unauthorized and branch-manager response writes', async () => {
    await expect(
      updateSupportHandoffPublicResponseCore({
        handoffId: 'handoff-1',
        response: 'Member-visible update',
        session: null,
      })
    ).resolves.toEqual({ error: 'Unauthorized', success: false });

    await expect(
      updateSupportHandoffPublicResponseCore({
        handoffId: 'handoff-1',
        response: 'Member-visible update',
        session: staffSession({ role: 'branch_manager' }),
      })
    ).resolves.toEqual({ error: 'Unauthorized', success: false });

    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('requires non-empty response text', async () => {
    const result = await updateSupportHandoffPublicResponseCore({
      handoffId: 'handoff-1',
      response: '   ',
      session: staffSession(),
    });

    expect(result).toEqual({ error: 'Public response is required', success: false });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('updates only accepted handoffs owned by the current staff with public response version CAS', async () => {
    const result = await updateSupportHandoffPublicResponseCore(
      {
        expectedVersion: 4,
        handoffId: 'handoff-1',
        response: '  We reviewed your request and will follow up here.  ',
        session: staffSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      data: {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
      success: true,
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        publicResponse: 'We reviewed your request and will follow up here.',
        publicResponseById: 'staff-1',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.public_response_version', 4);
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.lifecycle_version', 4);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_handoff.public_response_updated',
        metadata: expect.objectContaining({
          expectedVersion: 4,
          responseLength: 49,
        }),
      })
    );
  });

  it('truncates overlong response text at the domain maximum', async () => {
    const overlong = ` ${'a'.repeat(MAX_PUBLIC_RESPONSE_LENGTH + 50)} `;

    await updateSupportHandoffPublicResponseCore({
      handoffId: 'handoff-1',
      response: overlong,
      session: staffSession(),
    });

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        publicResponse: 'a'.repeat(MAX_PUBLIC_RESPONSE_LENGTH),
      })
    );
  });

  it('reports response concurrency misses without audit logging', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await updateSupportHandoffPublicResponseCore(
      {
        expectedVersion: 9,
        handoffId: 'handoff-1',
        response: 'Fresh response',
        session: staffSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      error: 'Handoff changed before response could be updated',
      success: false,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns a same-claim member-safe public response when available', async () => {
    mocks.selectLimit.mockResolvedValueOnce([
      {
        publicResponse: 'Claim-specific staff update',
        publicResponseAt: new Date('2026-05-04T09:00:00.000Z'),
        handoffId: 'handoff-1',
        publicResponseAcknowledgedAt: null,
        publicResponseAcknowledgedById: null,
        publicResponseAcknowledgedVersion: null,
        publicResponseVersion: 2,
      },
    ]);

    const result = await getMemberLatestPublicResponse({
      claimId: 'claim-1',
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });

    expect(result).toEqual({
      publicResponse: 'Claim-specific staff update',
      publicResponseAt: '2026-05-04T09:00:00.000Z',
      handoffId: 'handoff-1',
      publicResponseAcknowledged: false,
      publicResponseAcknowledgedAt: null,
      publicResponseAcknowledgedVersion: null,
      publicResponseVersion: 2,
    });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.member_id', 'member-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.claim_id', 'claim-1');
    expect(mocks.inArray).toHaveBeenCalledWith('support_handoffs.status', ACTIVE_HANDOFF_STATUSES);
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.public_response');
    expect(Object.keys(result ?? {})).toEqual([
      'handoffId',
      'publicResponse',
      'publicResponseAt',
      'publicResponseVersion',
      'publicResponseAcknowledged',
      'publicResponseAcknowledgedAt',
      'publicResponseAcknowledgedVersion',
    ]);
  });

  it('returns the targeted active handoff response without falling back to another handoff', async () => {
    mocks.selectLimit.mockResolvedValueOnce([
      {
        publicResponse: 'Targeted staff update',
        publicResponseAt: new Date('2026-05-04T11:00:00.000Z'),
        handoffId: 'handoff-1',
        publicResponseAcknowledgedAt: new Date('2026-05-04T11:05:00.000Z'),
        publicResponseAcknowledgedById: 'member-1',
        publicResponseAcknowledgedVersion: 3,
        publicResponseVersion: 3,
      },
    ]);

    const result = await getMemberLatestPublicResponse({
      claimId: 'claim-1',
      handoffId: 'handoff-1',
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });

    expect(result).toEqual({
      publicResponse: 'Targeted staff update',
      publicResponseAt: '2026-05-04T11:00:00.000Z',
      handoffId: 'handoff-1',
      publicResponseAcknowledged: true,
      publicResponseAcknowledgedAt: '2026-05-04T11:05:00.000Z',
      publicResponseAcknowledgedVersion: 3,
      publicResponseVersion: 3,
    });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.id', 'handoff-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.claim_id', 'claim-1');
    expect(mocks.selectLimit).toHaveBeenCalledTimes(1);
  });

  it('falls back to the latest active member response when no same-claim response exists', async () => {
    mocks.selectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        publicResponse: 'Latest generic staff update',
        publicResponseAt: '2026-05-04T10:00:00.000Z',
        handoffId: 'handoff-3',
        publicResponseAcknowledgedAt: new Date('2026-05-04T10:05:00.000Z'),
        publicResponseAcknowledgedById: 'member-1',
        publicResponseAcknowledgedVersion: 2,
        publicResponseVersion: 3,
      },
    ]);

    const result = await getMemberLatestPublicResponse({
      claimId: 'claim-2',
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });

    expect(result).toEqual({
      publicResponse: 'Latest generic staff update',
      publicResponseAt: '2026-05-04T10:00:00.000Z',
      handoffId: 'handoff-3',
      publicResponseAcknowledged: false,
      publicResponseAcknowledgedAt: null,
      publicResponseAcknowledgedVersion: 2,
      publicResponseVersion: 3,
    });
    expect(mocks.selectLimit).toHaveBeenCalledTimes(2);
  });
});
