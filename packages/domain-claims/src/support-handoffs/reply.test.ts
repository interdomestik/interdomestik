import { mocks, memberSession } from './reply.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitSupportHandoffMemberReplyCore } from './reply';
import type { SupportHandoffSession } from './types';
import { ACTIVE_HANDOFF_STATUSES, MAX_MEMBER_REPLY_LENGTH } from './types';

function submitReply(session: SupportHandoffSession | null = memberSession()) {
  return submitSupportHandoffMemberReplyCore({
    authority,
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
    memberReplyAt: null,
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

const authority = mintTestTenantAuthority('tenant-1');

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
        authority,
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
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.member_reply_at');
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
        authority,
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
        authority,
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
    mocks.selectLimit.mockResolvedValueOnce([
      fallbackRow({
        memberReplyAt: new Date('2026-05-05T08:45:00.000Z'),
        memberReplyResponseVersion: 2,
      }),
    ]);

    await expect(submitReply()).resolves.toEqual({
      code: 'ALREADY_REPLIED',
      error: 'You already replied to this response.',
      success: false,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
