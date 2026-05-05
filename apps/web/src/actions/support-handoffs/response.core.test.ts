import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),
  notifySupportHandoffPublicResponse: vi.fn(),
  revalidatePath: vi.fn(),
  updateDomainPublicResponse: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/response', () => ({
  updateSupportHandoffPublicResponseCore: mocks.updateDomainPublicResponse,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock('@/lib/notifications', () => ({
  notifySupportHandoffPublicResponse: mocks.notifySupportHandoffPublicResponse,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { updateSupportHandoffPublicResponseCore } from './response.core';

const staffSession = {
  user: {
    id: 'staff-1',
    role: 'staff',
    tenantId: 'tenant-1',
  },
} as Parameters<typeof updateSupportHandoffPublicResponseCore>[0]['session'];

describe('updateSupportHandoffPublicResponseCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifySupportHandoffPublicResponse.mockResolvedValue({ success: true });
  });

  it('notifies the member and revalidates staff and member help paths after a successful write', async () => {
    mocks.updateDomainPublicResponse.mockResolvedValueOnce({
      data: {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
      success: true,
    });

    const result = await updateSupportHandoffPublicResponseCore({
      expectedVersion: 1,
      handoffId: 'handoff-1',
      requestHeaders: new Headers({ referer: 'https://ks.example.test/sq/staff/support-handoffs' }),
      response: 'Member-visible response',
      session: staffSession,
    });

    expect(result).toEqual({
      data: {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
      success: true,
    });
    expect(mocks.updateDomainPublicResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        handoffId: 'handoff-1',
        response: 'Member-visible response',
      }),
      { logAuditEvent: mocks.logAuditEvent }
    );
    expect(mocks.notifySupportHandoffPublicResponse).toHaveBeenCalledWith(
      'member-1',
      { id: 'handoff-1', publicResponseVersion: 2 },
      {
        actionUrl: '/sq/member/help?handoffId=handoff-1',
        content: 'Një përditësim nga stafi është i disponueshëm për kërkesën tuaj të mbështetjes.',
        tenantId: 'tenant-1',
        title: 'Përditësim nga stafi',
      }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(8);
    for (const locale of ['sq', 'en', 'sr', 'mk']) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/support-handoffs`);
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/help`);
    }
  });

  it('does not revalidate paths when the domain write fails', async () => {
    mocks.updateDomainPublicResponse.mockResolvedValueOnce({
      error: 'Unauthorized',
      success: false,
    });

    const result = await updateSupportHandoffPublicResponseCore({
      expectedVersion: 1,
      handoffId: 'handoff-1',
      response: 'Member-visible response',
      session: null,
    });

    expect(result).toEqual({
      error: 'Unauthorized',
      success: false,
    });
    expect(mocks.notifySupportHandoffPublicResponse).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('keeps the response write successful when notification creation fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.updateDomainPublicResponse.mockResolvedValueOnce({
      data: {
        handoffId: 'handoff-1',
        memberId: 'member-1',
        publicResponseVersion: 2,
        tenantId: 'tenant-1',
      },
      success: true,
    });
    mocks.notifySupportHandoffPublicResponse.mockResolvedValueOnce({
      error: 'Database error',
      success: false,
    });

    const result = await updateSupportHandoffPublicResponseCore({
      expectedVersion: 1,
      handoffId: 'handoff-1',
      response: 'Member-visible response',
      session: staffSession,
    });

    expect(result.success).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to create support handoff public response notification:',
      expect.objectContaining({
        error: 'Database error',
        handoffId: 'handoff-1',
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
