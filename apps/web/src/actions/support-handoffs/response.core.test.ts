import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
  updateDomainPublicResponse: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/response', () => ({
  updateSupportHandoffPublicResponseCore: mocks.updateDomainPublicResponse,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
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
  });

  it('revalidates staff and member help paths across locales after a successful write', async () => {
    mocks.updateDomainPublicResponse.mockResolvedValueOnce({
      data: { publicResponseVersion: 2 },
      success: true,
    });

    const result = await updateSupportHandoffPublicResponseCore({
      expectedVersion: 1,
      handoffId: 'handoff-1',
      response: 'Member-visible response',
      session: staffSession,
    });

    expect(result).toEqual({
      data: { publicResponseVersion: 2 },
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
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
