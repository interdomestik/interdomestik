import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acknowledgeSupportHandoffPublicResponseCore } from './acknowledgement';
import type { SupportHandoffSession } from './types';
import { ACTIVE_HANDOFF_STATUSES } from './types';

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    db: {
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    },
    ensureTenantId: vi.fn(() => 'tenant-1'),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    inArray: vi.fn((left, right) => ({ left, op: 'inArray', right })),
    isNotNull: vi.fn(column => ({ column, op: 'isNotNull' })),
    logAuditEvent: vi.fn(),
    selectFrom,
    selectLimit,
    selectWhere,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    supportHandoffs: {
      id: 'support_handoffs.id',
      memberId: 'support_handoffs.member_id',
      publicResponse: 'support_handoffs.public_response',
      publicResponseAcknowledgedAt: 'support_handoffs.public_response_acknowledged_at',
      publicResponseAcknowledgedById: 'support_handoffs.public_response_acknowledged_by_id',
      publicResponseAcknowledgedVersion: 'support_handoffs.public_response_acknowledged_version',
      publicResponseVersion: 'support_handoffs.public_response_version',
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

function memberSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: {
      id: 'member-1',
      role: 'member',
      tenantId: 'tenant-1',
      ...overrides,
    },
  } as SupportHandoffSession;
}

describe('support handoff public response acknowledgement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([
      {
        acknowledgedAt: new Date('2026-05-05T09:00:00.000Z'),
        handoffId: 'handoff-1',
        publicResponseAcknowledgedVersion: 2,
      },
    ]);
    mocks.db.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLimit.mockResolvedValue([]);
  });

  it('rejects unauthenticated, staff, and branch-manager acknowledgement writes', async () => {
    await expect(
      acknowledgeSupportHandoffPublicResponseCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: null,
      })
    ).resolves.toEqual({ code: 'UNAUTHORIZED', error: 'Unauthorized', success: false });

    await expect(
      acknowledgeSupportHandoffPublicResponseCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: memberSession({ role: 'staff' }),
      })
    ).resolves.toEqual({ code: 'UNAUTHORIZED', error: 'Unauthorized', success: false });

    await expect(
      acknowledgeSupportHandoffPublicResponseCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: memberSession({ role: 'branch_manager' }),
      })
    ).resolves.toEqual({ code: 'UNAUTHORIZED', error: 'Unauthorized', success: false });

    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('acknowledges only the member-owned active current response version', async () => {
    const result = await acknowledgeSupportHandoffPublicResponseCore(
      {
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: memberSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      data: {
        acknowledgedAt: '2026-05-05T09:00:00.000Z',
        handoffId: 'handoff-1',
        publicResponseAcknowledgedVersion: 2,
      },
      success: true,
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        publicResponseAcknowledgedById: 'member-1',
        publicResponseAcknowledgedVersion: 2,
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.id', 'handoff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.member_id', 'member-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.public_response_version', 2);
    expect(mocks.inArray).toHaveBeenCalledWith('support_handoffs.status', ACTIVE_HANDOFF_STATUSES);
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.public_response');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_handoff.public_response_acknowledged',
        actorId: 'member-1',
        metadata: { publicResponseVersion: 2 },
      })
    );
  });

  it('returns idempotent success for a duplicate acknowledgement without audit logging', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([
      {
        acknowledgedAt: new Date('2026-05-05T09:00:00.000Z'),
        acknowledgedById: 'member-1',
        acknowledgedVersion: 2,
        publicResponse: 'Staff update',
        publicResponseVersion: 2,
        status: 'accepted',
      },
    ]);

    const result = await acknowledgeSupportHandoffPublicResponseCore(
      {
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: memberSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      data: {
        acknowledgedAt: '2026-05-05T09:00:00.000Z',
        handoffId: 'handoff-1',
        publicResponseAcknowledgedVersion: 2,
      },
      success: true,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns a stale-version error when staff updated the response while the member was reading', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([
      {
        acknowledgedAt: null,
        acknowledgedById: null,
        acknowledgedVersion: null,
        publicResponse: 'Newer staff update',
        publicResponseVersion: 3,
        status: 'accepted',
      },
    ]);

    const result = await acknowledgeSupportHandoffPublicResponseCore({
      expectedPublicResponseVersion: 2,
      handoffId: 'handoff-1',
      session: memberSession(),
    });

    expect(result).toEqual({
      code: 'STALE_VERSION',
      error: 'The support team updated this response. Please review the latest update.',
      success: false,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns a generic failure when the handoff or public response is unavailable', async () => {
    mocks.updateReturning.mockResolvedValue([]);
    mocks.selectLimit.mockResolvedValueOnce([]);

    await expect(
      acknowledgeSupportHandoffPublicResponseCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: memberSession(),
      })
    ).resolves.toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unable to acknowledge this response.',
      success: false,
    });

    mocks.selectLimit.mockResolvedValueOnce([
      {
        acknowledgedAt: null,
        acknowledgedById: null,
        acknowledgedVersion: null,
        publicResponse: null,
        publicResponseVersion: 2,
        status: 'accepted',
      },
    ]);

    await expect(
      acknowledgeSupportHandoffPublicResponseCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        session: memberSession(),
      })
    ).resolves.toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unable to acknowledge this response.',
      success: false,
    });
  });

  it('does not acknowledge closed handoffs', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([
      {
        acknowledgedAt: null,
        acknowledgedById: null,
        acknowledgedVersion: null,
        publicResponse: 'Closed update',
        publicResponseVersion: 2,
        status: 'closed',
      },
    ]);

    const result = await acknowledgeSupportHandoffPublicResponseCore({
      expectedPublicResponseVersion: 2,
      handoffId: 'handoff-1',
      session: memberSession(),
    });

    expect(result).toEqual({
      code: 'CLOSED',
      error: 'This support request is closed.',
      success: false,
    });
  });
});
