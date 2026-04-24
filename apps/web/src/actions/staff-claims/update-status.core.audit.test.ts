import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  domainUpdateStatus: vi.fn(),
  enforceRateLimitForAction: vi.fn(),
  logAuditEvent: vi.fn(),
  notifyStatusChanged: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/staff-claims/update-status', () => ({
  updateClaimStatusCore: hoisted.domainUpdateStatus,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoisted.logAuditEvent,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: hoisted.enforceRateLimitForAction,
}));

vi.mock('@/lib/notifications', () => ({
  notifyStatusChanged: hoisted.notifyStatusChanged,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

import { updateClaimStatusCore } from './update-status.core';

describe('staff update-status.core audit wiring', () => {
  const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimitForAction.mockResolvedValue({ limited: false });
    hoisted.domainUpdateStatus.mockResolvedValue({ success: true });
  });

  it('passes the audit logger into the staff domain status mutation', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'rejected' as never,
      note: 'Declined after review',
      requestHeaders,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
    });

    expect(result).toEqual({ success: true });
    expect(hoisted.domainUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        requestHeaders,
      }),
      { logAuditEvent: hoisted.logAuditEvent, notifyStatusChanged: hoisted.notifyStatusChanged }
    );
  });

  it('revalidates member and staff tracker paths after a successful status update', async () => {
    await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'evaluation' as never,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
    });

    for (const locale of LOCALES) {
      expect(hoisted.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims/claim-1`);
      expect(hoisted.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims`);
      expect(hoisted.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/claims/claim-1`);
      expect(hoisted.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/claims`);
    }
  });
});
