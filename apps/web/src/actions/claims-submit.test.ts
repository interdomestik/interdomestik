import type { CreateClaimValues } from '@/lib/validators/claims';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitClaim } from './claims.core';
import {
  mockDbInsert,
  mockGetActiveSubscription,
  mockGetSession,
  mockHasActiveMembership,
  resetClaimActionMocks,
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

  describe('submitClaim', () => {
    const validPayload: CreateClaimValues = {
      title: 'Valid title here',
      description: 'This description is long enough to pass validation',
      companyName: 'Company',
      category: 'consumer',
      claimAmount: '100.00',
      currency: 'EUR',
      files: [
        {
          id: 'file-1',
          name: 'receipt.pdf',
          path: 'pii/tenants/tenant_mk/claims/user-123/unassigned/file-1',
          type: 'application/pdf',
          size: 1024,
          bucket: 'claim-evidence',
          classification: 'pii',
          category: 'evidence',
          uploadIntentToken: 'server-issued-upload-intent',
        },
      ],
    };

    it('returns error when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      await expect(submitClaim(validPayload)).resolves.toEqual({
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    });

    it('returns error when user has no active membership', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      mockHasActiveMembership.mockResolvedValue(false);
      mockGetActiveSubscription.mockResolvedValue(null);

      await expect(submitClaim(validPayload)).resolves.toEqual({
        success: false,
        error: 'Membership required to file a claim.',
        code: 'MEMBERSHIP_REQUIRED',
      });
    });

    it('should insert claim and documents when payload is valid', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const result = await submitClaim(validPayload);

      expect(result).toEqual({
        success: true,
        claimId: 'test-id',
        claimNumber: 'CLM-MK-2026-000001',
        commercialFlow: {
          escalationRequest: {
            claimCategory: 'consumer',
            decision: 'declined',
            decisionReason: 'outside_launch_scope',
          },
          freeStartCompletion: {
            claimCategory: 'consumer',
          },
        },
      });

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          title: 'Valid title here',
          userId: 'user-123',
          caseLifecycleState: 'submitted',
          recoveryLifecycleState: 'not_started',
        })
      );

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          claimId: 'test-id',
          changedById: 'user-123',
          changedByRole: 'member',
          toStatus: 'submitted',
          isPublic: true,
        })
      );

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        3,
        expect.arrayContaining([
          expect.objectContaining({
            filePath: validPayload.files[0].path,
            uploadedBy: 'user-123',
          }),
        ])
      );
    });

    it('should insert claim without documents when files are empty', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const payloadWithoutFiles: CreateClaimValues = { ...validPayload, files: [] };

      await submitClaim(payloadWithoutFiles);

      // First insert is claim
      expect(mockDbInsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'user-123',
          caseLifecycleState: 'submitted',
          recoveryLifecycleState: 'not_started',
        })
      );
      expect(mockDbInsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          claimId: 'test-id',
          changedById: 'user-123',
          changedByRole: 'member',
          toStatus: 'submitted',
          isPublic: true,
        })
      );
      expect(mockDbInsert).toHaveBeenCalledTimes(2);
    });

    it('returns error on validation failure', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const invalidPayload = {
        title: 'AB', // Too short - needs min 5 chars
        description: 'Test',
        companyName: 'Company',
        category: 'consumer',
        claimAmount: '100.00',
        currency: 'EUR',
        files: [],
      };

      await expect(submitClaim(invalidPayload as CreateClaimValues)).resolves.toEqual({
        success: false,
        error: 'Validation failed',
        code: 'INVALID_PAYLOAD',
      });

      const failed = await submitClaim(invalidPayload as CreateClaimValues);
      expect(failed).not.toHaveProperty('claimId');
    });

    it('should throw on database error during claim insert', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      mockDbInsert.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await submitClaim(validPayload);

      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_SERVER_ERROR',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('submitClaim - optional fields coverage', () => {
    it('should handle empty description as minimal value', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const payload: CreateClaimValues = {
        title: 'Valid title here',
        description: 'A description that is exactly the minimum required length',
        companyName: 'Company',
        category: 'consumer',
        claimAmount: '', // Empty string for optional
        currency: 'EUR',
        files: [],
      };

      await submitClaim(payload);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'EUR',
        })
      );
    });

    it('should handle file with explicit classification', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const payload: CreateClaimValues = {
        title: 'Valid title here',
        description: 'A description that is exactly the minimum required length',
        companyName: 'Company',
        category: 'consumer',
        claimAmount: '500',
        currency: 'USD',
        files: [
          {
            id: 'file-1',
            name: 'doc.pdf',
            path: 'pii/tenants/tenant_mk/claims/user-123/unassigned/file-1',
            type: 'application/pdf',
            size: 1024,
            bucket: 'claim-evidence',
            classification: 'public',
            category: 'evidence',
            uploadIntentToken: 'server-issued-upload-intent',
          },
        ],
      };

      await submitClaim(payload);

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        3,
        expect.arrayContaining([
          expect.objectContaining({
            classification: 'public',
          }),
        ])
      );
    });
  });
});
