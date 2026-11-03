import { mocks, memberSession } from './reply.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitSupportHandoffMemberReplyCore } from './reply';
import type { SupportHandoffSession } from './types';

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

  it('keeps the bounded reply model terminal after staff follow-up', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.selectLimit.mockResolvedValueOnce([
      fallbackRow({
        memberReplyAt: new Date('2026-05-05T08:45:00.000Z'),
        memberReplyResponseVersion: 1,
        publicResponseVersion: 2,
      }),
    ]);

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
        authority,
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
