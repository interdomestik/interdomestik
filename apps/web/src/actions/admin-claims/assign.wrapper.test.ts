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

const claimFindFirst = vi.fn();
const withTenant = vi.fn((tenantId, tenantColumn, condition) => ({
  tenantId,
  tenantColumn,
  condition,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: claimFindFirst,
      },
    },
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant,
}));

describe('assignClaimCore (Wrapper Means)', () => {
  const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
  const mockSession = {
    session: {
      id: 'sess1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'admin1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'token1',
    },
    user: { id: 'admin1', role: 'admin', tenantId: 'tenant1', email: 'admin@test.com' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const mockHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
    claimFindFirst.mockResolvedValue({ id: 'claim1', staffId: 'staff-old' });
  });

  it('should call domain assignClaimCore with correct params', async () => {
    vi.spyOn(domainAssign, 'assignClaimCore').mockResolvedValueOnce({
      success: true,
      error: undefined,
    });

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
    vi.spyOn(domainAssign, 'assignClaimCore').mockResolvedValueOnce({
      success: true,
      error: undefined,
    });

    await assignClaimCore({
      claimId: 'claim1',
      staffId: 'staff1',
      session: mockSession,
      requestHeaders: mockHeaders,
    });

    for (const locale of LOCALES) {
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/claims`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/claims/claim1`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/admin/claims`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/admin/claims/claim1`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims/claim1`);
    }
  });

  it('should not revalidate on denied/no-op result', async () => {
    vi.spyOn(domainAssign, 'assignClaimCore').mockResolvedValueOnce({
      success: false,
      error: 'Claim not found',
      data: undefined,
    });

    const result = await assignClaimCore({
      claimId: 'claim1',
      staffId: 'staff1',
      session: mockSession,
      requestHeaders: mockHeaders,
    });

    expect(result).toEqual({ success: false, error: 'Claim not found', data: undefined });
    expect(nextCache.revalidatePath).not.toHaveBeenCalled();
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

  it('assignment no-op should not call domain mutation or revalidate', async () => {
    claimFindFirst.mockResolvedValueOnce({ id: 'claim1', staffId: 'staff1' });

    const result = await assignClaimCore({
      claimId: 'claim1',
      staffId: 'staff1',
      session: mockSession,
      requestHeaders: mockHeaders,
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(domainAssign.assignClaimCore).not.toHaveBeenCalled();
    expect(nextCache.revalidatePath).not.toHaveBeenCalled();
  });
});
