import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateClaimStatus } from './claims';
import {
  mockGetActiveSubscription,
  mockGetSession,
  mockHasActiveMembership,
  mockTxSelectLimit,
  mockTxUpdateReturning,
  resetClaimActionMocks,
  submittedLifecycleCurrentClaim,
} from './claims.test-support';

vi.mock('@interdomestik/domain-membership-billing/subscription', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/domain-membership-billing/subscription')>();
  return {
    ...actual,
    hasActiveMembership: () => mockHasActiveMembership(),
    getActiveSubscription: () => mockGetActiveSubscription(),
  };
});
vi.mock('@/lib/auth', async () => (await import('./claims.test-support')).authModuleMock());
vi.mock('@interdomestik/database/claim-number', async () =>
  (await import('./claims.test-support')).claimNumberModuleMock()
);
vi.mock('@interdomestik/database/tenant-directory', async () =>
  (await import('./claims.test-support')).tenantDirectoryModuleMock()
);
vi.mock('@interdomestik/database', async () =>
  (await import('./claims.test-support')).databaseModuleMock()
);
vi.mock('nanoid', async () => (await import('./claims.test-support')).nanoidModuleMock());
vi.mock('next/cache', async () => (await import('./claims.test-support')).nextCacheModuleMock());
vi.mock('next/headers', async () =>
  (await import('./claims.test-support')).nextHeadersModuleMock()
);
vi.mock('@/lib/notifications', async () =>
  (await import('./claims.test-support')).notificationsModuleMock()
);
vi.mock('@/lib/ai/claim-workflows', async () =>
  (await import('./claims.test-support')).aiClaimWorkflowsModuleMock()
);
vi.mock('@/lib/audit', async () => (await import('./claims.test-support')).auditModuleMock());
vi.mock('@/features/claims/upload/server/initial-claim-upload', async () =>
  (await import('./claims.test-support')).initialClaimUploadModuleMock()
);

describe('Claim Actions', () => {
  beforeEach(() => {
    resetClaimActionMocks();
  });

  describe('updateClaimStatus', () => {
    it('should deny non-admin and non-staff users', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', role: 'user', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'verification');
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('should allow staff users to update status', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'verification');

      expect(mockTxUpdateReturning).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should allow admin users to update status', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'verification');

      expect(mockTxUpdateReturning).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should reject invalid status values', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'super-resolved');
      expect(result).toEqual({ success: false, error: 'Invalid status' });
    });
  });

  describe('updateClaimStatus - additional cases', () => {
    it('should deny unauthenticated users', async () => {
      mockGetSession.mockResolvedValue(null);
      const result = await updateClaimStatus('claim-1', 'verification');
      expect(result).toEqual({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    });

    it('should handle database errors during status update', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mockTxSelectLimit.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await updateClaimStatus('claim-1', 'verification');

      consoleErrorSpy.mockRestore();

      expect(result).toEqual({ success: false, error: 'Failed to update status' });
    });

    it('should accept same-status updates', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mockTxSelectLimit.mockResolvedValueOnce([submittedLifecycleCurrentClaim]);
      const result = await updateClaimStatus('claim-1', 'submitted');
      expect(result).toEqual({ success: true });
    });
  });
});
