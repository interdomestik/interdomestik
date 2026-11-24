import { refuseAcceptance } from '@/test/member-acceptance.test-support';
import './claims.test-mocks';
import type { CreateClaimValues } from '@/lib/validators/claims';
import { describe, expect, it, vi } from 'vitest';
import { submitClaim } from './claims.core';
import {
  mockAttachedEvidenceRows,
  mockDbInsert,
  mockGetActiveSubscription,
  mockLockClaimEvidenceObjects,
  mockGetSession,
  mockHasActiveMembership,
} from './claims.test-support';

vi.mock('@/lib/claim-notification-delivery-kick', () => ({
  kickClaimNotificationDeliveries: vi.fn(),
}));
vi.mock('../../../../packages/domain-claims/src/staff-claims/notification-recipients', () => ({
  resolveStaffClaimNotificationRecipients: vi.fn().mockResolvedValue([]),
}));
vi.mock('@interdomestik/domain-communications/notification-deliveries', () => ({
  enqueueClaimSubmittedNotification: vi.fn().mockResolvedValue([]),
  enqueueStaffClaimNotification: vi.fn().mockResolvedValue([]),
  lockClaimNotificationRecipient: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims/claims/response-requests', () => ({
  createClaimResponseRequest: vi.fn(),
}));

function signInMember() {
  mockGetSession.mockResolvedValue({
    user: { id: 'user-123', role: 'member', tenantId: 'tenant_mk' },
  });
}

describe('Claim Actions', () => {
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

    it('refuses before protected work when acceptance is missing', async () => {
      refuseAcceptance();
      mockGetSession.mockResolvedValue({
        user: { id: 'fixture-member', role: 'member', tenantId: 'tenant_mk' },
      });
      await expect(submitClaim(validPayload)).resolves.toMatchObject({
        success: false,
        code: 'acceptance_required',
      });
      expect(mockHasActiveMembership).not.toHaveBeenCalled();
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('returns error when unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      await expect(submitClaim(validPayload)).resolves.toEqual({
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    });

    it('returns error when user has no active membership', async () => {
      signInMember();
      mockHasActiveMembership.mockResolvedValue(false);
      mockGetActiveSubscription.mockResolvedValue(null);

      await expect(submitClaim(validPayload)).resolves.toEqual({
        success: false,
        error: 'Membership required to file a claim.',
        code: 'MEMBERSHIP_REQUIRED',
      });
    });

    it('should insert claim and documents when payload is valid', async () => {
      signInMember();

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
      expect(mockLockClaimEvidenceObjects).toHaveBeenCalledWith(expect.anything(), 'tenant_mk', [
        expect.objectContaining({ bucket: 'claim-evidence', path: validPayload.files[0].path }),
      ]);
    });

    it('refuses an evidence object already attached to another claim and inserts no document', async () => {
      signInMember();
      mockAttachedEvidenceRows.mockResolvedValue([
        { bucket: 'claim-evidence', claimId: 'other-claim', filePath: validPayload.files[0].path },
      ]);

      await expect(submitClaim(validPayload)).resolves.toMatchObject({
        success: false,
        code: 'INVALID_PATH',
      });
      expect(mockDbInsert).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ filePath: validPayload.files[0].path })])
      );
    });

    it('should insert claim without documents when files are empty', async () => {
      signInMember();

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
      signInMember();

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
      signInMember();
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
      signInMember();

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
      signInMember();

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
