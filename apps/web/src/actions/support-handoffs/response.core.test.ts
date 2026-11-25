import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
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

const authority = mintTestTenantAuthority('tenant-1');

describe('updateSupportHandoffPublicResponseCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates staff and member help paths after a successful write', async () => {
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
      authority,
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
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(10);
    for (const locale of ['sq', 'en', 'sr', 'mk', 'de']) {
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
      authority,
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

  it('propagates a rolled back notification insert without refreshing either surface', async () => {
    mocks.updateDomainPublicResponse.mockResolvedValueOnce({
      error: 'Public response could not be saved',
      success: false,
    });

    await expect(
      updateSupportHandoffPublicResponseCore({
        authority,
        handoffId: 'handoff-1',
        response: 'Member-visible response',
        session: staffSession,
      })
    ).resolves.toEqual({ success: false, error: 'Public response could not be saved' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
