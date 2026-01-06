import * as audit from '@/lib/audit';
import * as notifications from '@/lib/notifications';
import * as domainAssign from '@interdomestik/domain-claims/agent-claims/assign';
import * as nextCache from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignClaimCore } from './assign.core';

vi.mock('@interdomestik/domain-claims/agent-claims/assign', () => ({
  assignClaimCore: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifyClaimAssigned: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('assignClaimCore (Wrapper Means)', () => {
  const mockSession = {
    user: { id: 'admin1', role: 'admin', tenantId: 'tenant1', email: 'admin@test.com' },
  };
  const mockHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call domain assignClaimCore with correct params', async () => {
    const params = {
      claimId: 'claim1',
      staffId: 'staff1',
      session: mockSession,
      requestHeaders: mockHeaders,
    };

    await assignClaimCore(params);

    expect(domainAssign.assignClaimCore).toHaveBeenCalledWith(
      params,
      expect.objectContaining({
        logAuditEvent: audit.logAuditEvent,
        notifyClaimAssigned: notifications.notifyClaimAssigned,
      })
    );
  });

  it('should revalidate paths', async () => {
    await assignClaimCore({
      claimId: 'claim1',
      staffId: 'staff1',
      session: mockSession,
      requestHeaders: mockHeaders,
    });

    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/member/claims');
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/member/claims/claim1');
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/admin/claims');
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/admin/claims/claim1');
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/staff/claims');
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/staff/claims/claim1');
  });

  it('should propagate errors from domain layer', async () => {
    vi.spyOn(domainAssign, 'assignClaimCore').mockRejectedValueOnce(new Error('Domain Error'));

    await expect(
      assignClaimCore({
        claimId: 'claim1',
        staffId: 'staff1',
        session: mockSession,
        requestHeaders: mockHeaders,
      })
    ).rejects.toThrow('Domain Error');
  });
});
