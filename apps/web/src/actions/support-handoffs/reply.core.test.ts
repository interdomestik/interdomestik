import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
  submitDomainMemberReply: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/reply', () => ({
  submitSupportHandoffMemberReplyCore: mocks.submitDomainMemberReply,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { submitSupportHandoffMemberReplyCore } from './reply.core';

const memberSession = {
  user: {
    id: 'member-1',
    role: 'member',
    tenantId: 'tenant-1',
  },
} as Parameters<typeof submitSupportHandoffMemberReplyCore>[0]['session'];

function submitReply() {
  return submitSupportHandoffMemberReplyCore({
    expectedPublicResponseVersion: 2,
    handoffId: 'handoff-1',
    replyText: 'This resolves my request.',
    session: memberSession,
  });
}

function expectLocaleRevalidation(locale = 'sq') {
  expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/help`);
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/support-handoffs`);
}

describe('submitSupportHandoffMemberReplyCore web action wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates member and staff support paths after a successful member reply', async () => {
    const successfulReply = {
      data: {
        handoffId: 'handoff-1',
        memberReplyAt: '2026-05-05T09:00:00.000Z',
        memberReplyResponseVersion: 2,
      },
      success: true,
    } as const;
    mocks.submitDomainMemberReply.mockResolvedValueOnce(successfulReply);

    await expect(submitReply()).resolves.toEqual(successfulReply);
    expect(mocks.submitDomainMemberReply).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
        replyText: 'This resolves my request.',
      }),
      { logAuditEvent: mocks.logAuditEvent }
    );
    expectLocaleRevalidation();
  });

  it('revalidates only the request locale after a successful member reply', async () => {
    const successfulReply = {
      data: {
        handoffId: 'handoff-1',
        memberReplyAt: '2026-05-05T09:00:00.000Z',
        memberReplyResponseVersion: 2,
      },
      success: true,
    } as const;
    mocks.submitDomainMemberReply.mockResolvedValueOnce(successfulReply);

    await submitSupportHandoffMemberReplyCore({
      expectedPublicResponseVersion: 2,
      handoffId: 'handoff-1',
      replyText: 'This resolves my request.',
      requestHeaders: new Headers({ 'x-next-intl-locale': 'sq' }),
      session: memberSession,
    });

    expectLocaleRevalidation('sq');
  });

  it('does not revalidate paths for non-mutating reply failures', async () => {
    const staleReply = {
      code: 'STALE_VERSION',
      error: 'The support team updated this response. Please review the latest update.',
      success: false,
    } as const;
    mocks.submitDomainMemberReply.mockResolvedValueOnce(staleReply);

    await expect(submitReply()).resolves.toEqual(staleReply);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not revalidate paths when unauthorized', async () => {
    const unauthorizedReply = {
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      success: false,
    } as const;
    mocks.submitDomainMemberReply.mockResolvedValueOnce(unauthorizedReply);

    await expect(submitReply()).resolves.toEqual(unauthorizedReply);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
