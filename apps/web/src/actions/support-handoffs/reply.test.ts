import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActionContext: vi.fn(),
  submitSupportHandoffMemberReplyCore: vi.fn(),
}));

vi.mock('./context', () => ({
  getActionContext: mocks.getActionContext,
}));

vi.mock('./reply.core', () => ({
  submitSupportHandoffMemberReplyCore: mocks.submitSupportHandoffMemberReplyCore,
}));

import { submitSupportHandoffMemberReply } from './reply';

function formData(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set('handoffId', overrides.handoffId ?? 'handoff-1');
  data.set('expectedPublicResponseVersion', overrides.expectedPublicResponseVersion ?? '2');
  data.set('memberReply', overrides.memberReply ?? '  This resolves my request.  ');
  return data;
}

describe('submitSupportHandoffMemberReply server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionContext.mockResolvedValue({
      requestHeaders: new Headers({ referer: 'https://ks.example.test/en/member/help' }),
      session: {
        user: {
          id: 'member-1',
          role: 'member',
          tenantId: 'tenant-1',
        },
      },
    });
    mocks.submitSupportHandoffMemberReplyCore.mockResolvedValue({
      data: {
        handoffId: 'handoff-1',
        memberReplyAt: '2026-05-05T09:00:00.000Z',
        memberReplyResponseVersion: 2,
      },
      success: true,
    });
  });

  it('submits trimmed validated reply text to the core action', async () => {
    const result = await submitSupportHandoffMemberReply({ success: false }, formData());

    expect(result).toEqual({
      memberReplyAt: '2026-05-05T09:00:00.000Z',
      memberReplyResponseVersion: 2,
      success: true,
    });
    expect(mocks.submitSupportHandoffMemberReplyCore).toHaveBeenCalledWith({
      expectedPublicResponseVersion: 2,
      handoffId: 'handoff-1',
      replyText: 'This resolves my request.',
      requestHeaders: expect.any(Headers),
      session: expect.objectContaining({ user: expect.objectContaining({ id: 'member-1' }) }),
    });
  });

  it('rejects overlong replies before reaching the domain core', async () => {
    const result = await submitSupportHandoffMemberReply(
      { success: false },
      formData({ memberReply: 'a'.repeat(1001) })
    );

    expect(result).toEqual({
      code: 'VALIDATION',
      error: 'Member reply is required and must be 1,000 characters or fewer.',
      success: false,
    });
    expect(mocks.getActionContext).not.toHaveBeenCalled();
    expect(mocks.submitSupportHandoffMemberReplyCore).not.toHaveBeenCalled();
  });

  it('returns the domain error code without replacing it', async () => {
    mocks.submitSupportHandoffMemberReplyCore.mockResolvedValueOnce({
      code: 'ALREADY_REPLIED',
      error: 'You already replied to this response.',
      success: false,
    });

    await expect(submitSupportHandoffMemberReply({ success: false }, formData())).resolves.toEqual({
      code: 'ALREADY_REPLIED',
      error: 'You already replied to this response.',
      success: false,
    });
  });
});
