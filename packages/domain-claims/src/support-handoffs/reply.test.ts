import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitSupportHandoffMemberReplyCore } from './reply';
import type { SupportHandoffSession } from './types';
import { ACTIVE_HANDOFF_STATUSES, MAX_MEMBER_REPLY_LENGTH } from './types';

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn();
  const selectLimit = vi.fn();
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const column = (name: string) => `support_handoffs.${name}`;

  return {
    and: vi.fn((...conditions) => ({ conditions, predicate: 'and' })),
    db: Object.fromEntries([
      ['select', vi.fn(() => ({ from: selectFrom }))],
      ['update', vi.fn(() => ({ set: updateSet }))],
    ]),
    ensureTenantId: vi.fn().mockReturnValue('tenant-1'),
    eq: vi.fn((left, right) => ({ left, predicate: 'eq', right })),
    inArray: vi.fn((left, right) => ({ left, predicate: 'inArray', right })),
    isNotNull: vi.fn(columnName => ({ column: columnName, predicate: 'isNotNull' })),
    logAuditEvent: vi.fn(),
    selectFrom,
    selectLimit,
    selectWhere,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    supportHandoffs: {
      id: column('id'),
      memberId: column('member_id'),
      memberReply: column('member_reply'),
      memberReplyAt: column('member_reply_at'),
      memberReplyResponseVersion: column('member_reply_response_version'),
      publicResponse: column('public_response'),
      publicResponseAcknowledgedAt: column('public_response_acknowledged_at'),
      publicResponseAcknowledgedById: column('public_response_acknowledged_by_id'),
      publicResponseAcknowledgedVersion: column('public_response_acknowledged_version'),
      publicResponseVersion: column('public_response_version'),
      status: column('status'),
      tenantId: column('tenant_id'),
      updatedAt: column('updated_at'),
    },
    updateReturning,
    updateSet,
    updateWhere,
    withTenant: vi.fn((_tenantId, _tenantColumn, condition) => ({ condition, tenantScoped: true })),
  };
});

function databaseExports() {
  return {
    and: mocks.and,
    db: mocks.db,
    eq: mocks.eq,
    sql: mocks.sql,
    supportHandoffs: mocks.supportHandoffs,
  };
}

function tenantSecurityExports() {
  return { withTenant: mocks.withTenant };
}

function sharedAuthExports() {
  return { ensureTenantId: mocks.ensureTenantId };
}

function drizzleExports() {
  return { inArray: mocks.inArray, isNotNull: mocks.isNotNull };
}

vi.mock('@interdomestik/database', databaseExports);
vi.mock('@interdomestik/database/tenant-security', tenantSecurityExports);
vi.mock('@interdomestik/shared-auth', sharedAuthExports);
vi.mock('drizzle-orm', drizzleExports);

function memberSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: Object.assign({ id: 'member-1', role: 'member', tenantId: 'tenant-1' }, overrides),
  } as SupportHandoffSession;
}

function submitReply(session: SupportHandoffSession | null = memberSession()) {
  return submitSupportHandoffMemberReplyCore({
    expectedPublicResponseVersion: 2,
    handoffId: 'handoff-1',
    replyText: '  This resolves my request.  ',
    session,
  });
}

function fallbackRow(overrides = {}) {
  return {
    acknowledgedAt: new Date('2026-05-05T08:30:00.000Z'),
    acknowledgedById: 'member-1',
    acknowledgedVersion: 2,
    memberReplyResponseVersion: null,
    publicResponse: 'Staff update',
    publicResponseVersion: 2,
    status: 'accepted',
    ...overrides,
  };
}

function findSqlCallWithValue(value: unknown) {
  return mocks.sql.mock.calls.find(call => call.slice(1).includes(value));
}

describe('support handoff member reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([
      {
        handoffId: 'handoff-1',
        memberReplyAt: new Date('2026-05-05T09:00:00.000Z'),
        memberReplyResponseVersion: 2,
      },
    ]);
    mocks.db.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLimit.mockResolvedValue([]);
  });

  it('rejects unauthenticated, staff, and branch-manager reply writes', async () => {
    await expect(submitReply(null)).resolves.toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      success: false,
    });

    await expect(submitReply(memberSession({ role: 'staff' }))).resolves.toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      success: false,
    });

    await expect(submitReply(memberSession({ role: 'branch_manager' }))).resolves.toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      success: false,
    });

    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('submits a trimmed reply only for the member-owned active acknowledged response version', async () => {
    const result = await submitSupportHandoffMemberReplyCore(
      {
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        replyText: '  This resolves my request.  ',
        session: memberSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      data: {
        handoffId: 'handoff-1',
        memberReplyAt: '2026-05-05T09:00:00.000Z',
        memberReplyResponseVersion: 2,
      },
      success: true,
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        memberReply: 'This resolves my request.',
        memberReplyResponseVersion: 2,
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.id', 'handoff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.member_id', 'member-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.public_response_version', 2);
    expect(mocks.eq).toHaveBeenCalledWith(
      'support_handoffs.public_response_acknowledged_by_id',
      'member-1'
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      'support_handoffs.public_response_acknowledged_version',
      2
    );
    expect(mocks.inArray).toHaveBeenCalledWith('support_handoffs.status', ACTIVE_HANDOFF_STATUSES);
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.public_response');
    expect(mocks.isNotNull).toHaveBeenCalledWith(
      'support_handoffs.public_response_acknowledged_at'
    );
    const idempotencyGuard = findSqlCallWithValue('support_handoffs.member_reply_response_version');
    expect(idempotencyGuard?.[0].join('')).toContain('is distinct from');
    expect(idempotencyGuard).toContain(2);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_handoff.member_reply_submitted',
        actorId: 'member-1',
        metadata: {
          handoffId: 'handoff-1',
          memberId: 'member-1',
          replyAt: '2026-05-05T09:00:00.000Z',
          replyResponseVersion: 2,
          tenantId: 'tenant-1',
        },
      })
    );
  });

  it('rejects blank and overlong direct-domain replies as validation failures', async () => {
    await expect(
      submitSupportHandoffMemberReplyCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        replyText: '   ',
        session: memberSession(),
      })
    ).resolves.toEqual({
      code: 'VALIDATION',
      error: 'Member reply is required.',
      success: false,
    });

    await expect(
      submitSupportHandoffMemberReplyCore({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        replyText: 'a'.repeat(MAX_MEMBER_REPLY_LENGTH + 1),
        session: memberSession(),
      })
    ).resolves.toEqual({
      code: 'VALIDATION',
      error: 'Member reply must be 1,000 characters or fewer.',
      success: false,
    });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('returns already-replied when the update fallback finds a same-cycle reply', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([fallbackRow({ memberReplyResponseVersion: 2 })]);

    await expect(submitReply()).resolves.toEqual({
      code: 'ALREADY_REPLIED',
      error: 'You already replied to this response.',
      success: false,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns stale-version when staff updated the response before the reply persisted', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([fallbackRow({ publicResponseVersion: 3 })]);

    await expect(submitReply()).resolves.toEqual({
      code: 'STALE_VERSION',
      error: 'The support team updated this response. Please review the latest update.',
      success: false,
    });
  });

  it('requires an acknowledged current response before accepting a reply', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([fallbackRow({ acknowledgedAt: null })]);

    await expect(submitReply()).resolves.toEqual({
      code: 'NOT_ACKNOWLEDGED',
      error: 'Please acknowledge this response before replying.',
      success: false,
    });
  });

  it('does not accept replies when no current public response exists', async () => {
    await expect(
      submitSupportHandoffMemberReplyCore({
        expectedPublicResponseVersion: 0,
        handoffId: 'handoff-1',
        replyText: 'Trying to reply without a response.',
        session: memberSession(),
      })
    ).resolves.toEqual({
      code: 'NO_RESPONSE',
      error: 'Unable to reply to this response.',
      success: false,
    });
    expect(mocks.db.update).not.toHaveBeenCalled();

    mocks.updateReturning.mockResolvedValue([]);
    mocks.selectLimit.mockResolvedValueOnce([]);

    await expect(submitReply()).resolves.toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unable to reply to this response.',
      success: false,
    });

    mocks.selectLimit.mockResolvedValueOnce([fallbackRow({ publicResponse: null })]);

    await expect(submitReply()).resolves.toEqual({
      code: 'NO_RESPONSE',
      error: 'Unable to reply to this response.',
      success: false,
    });
  });

  it('does not accept replies for closed handoffs', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([fallbackRow({ status: 'closed' })]);

    await expect(submitReply()).resolves.toEqual({
      code: 'CLOSED',
      error: 'This support request is closed.',
      success: false,
    });
  });
});
