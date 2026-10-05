import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaim } from './claims';
import {
  mockDbInsert,
  mockGetActiveSubscription,
  mockGetSession,
  mockHasActiveMembership,
  resetClaimActionMocks,
  type MockResolvedOnce,
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

  describe('createClaim', () => {
    it('should fail if user has no active membership', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      mockGetActiveSubscription.mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('title', 'Valid Title');
      formData.append('companyName', 'Company');
      formData.append('category', 'retail');

      const result = await createClaim({}, formData);
      expect(result).toEqual({ success: false, error: 'Membership required to create a claim.' });
    });

    it('should fail if user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const formData = new FormData();
      const result = await createClaim({}, formData);
      expect(result).toEqual({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    });

    it('should fail with validation errors for empty data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      const formData = new FormData();
      const result = await createClaim({}, formData);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error', 'Validation failed');
      expect(result).toHaveProperty('issues');
    });

    it('should create a claim successfully with valid data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      const formData = new FormData();
      formData.append('title', 'Test Claim');
      formData.append('companyName', 'Bad Company');
      formData.append('category', 'retail');

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Claim',
          companyName: 'Bad Company',
          userId: 'user-123',
          caseLifecycleState: 'draft',
          recoveryLifecycleState: 'not_started',
        })
      );
    });

    it('applies tenant default branch when subscription has no branchId', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      mockGetActiveSubscription.mockResolvedValueOnce({
        id: 'sub-1',
        userId: 'user-123',
        status: 'active',
        branchId: null,
        agentId: null,
      });

      const tenantSettingsFindFirst = db.query.tenantSettings
        .findFirst as never as MockResolvedOnce;

      tenantSettingsFindFirst.mockResolvedValueOnce({
        value: { branchId: 'branch-mk-skopje-center' },
      });

      const formData = new FormData();
      formData.append('title', 'Test Claim');
      formData.append('companyName', 'Bad Company');
      formData.append('category', 'retail');

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-mk-skopje-center',
        })
      );
    });
  });

  describe('createClaim - error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      mockDbInsert.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const formData = new FormData();
      formData.append('title', 'Test Claim');
      formData.append('companyName', 'Bad Company');
      formData.append('category', 'retail');

      const result = await createClaim({}, formData);

      consoleErrorSpy.mockRestore();

      expect(result).toEqual({
        success: false,
        error: 'Failed to create claim. Please try again.',
      });
    });

    it('should handle optional claimAmount as empty string', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const formData = new FormData();
      formData.append('title', 'Test Claim');
      formData.append('companyName', 'Bad Company');
      formData.append('category', 'retail');
      formData.append('claimAmount', '');

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Claim',
          claimAmount: undefined,
        })
      );
    });
  });

  describe('createClaim - claimAmount transform coverage', () => {
    it('should transform truthy claimAmount value', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const formData = new FormData();
      formData.append('title', 'Test Claim');
      formData.append('companyName', 'Bad Company');
      formData.append('category', 'retail');
      formData.append('claimAmount', '999.99');

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          claimAmount: '999.99',
        })
      );
    });
  });
});
