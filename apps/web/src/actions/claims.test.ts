import type { CreateClaimValues } from '@/lib/validators/claims';
import { db } from '@interdomestik/database';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaim, submitClaim, updateClaimStatus } from './claims';

// Mocks
const mockGetSession = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockHasActiveMembership = vi.fn();

type MockResolvedOnce = {
  mockResolvedValueOnce: (value: unknown) => unknown;
};

vi.mock('@interdomestik/domain-membership-billing/subscription', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/domain-membership-billing/subscription')>();
  return {
    ...actual,
    hasActiveMembership: () => mockHasActiveMembership(),
  };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mockGetSession(),
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: () => ({ values: mockDbInsert }),
    update: () => ({ set: () => ({ where: mockDbUpdate }) }),
    transaction: async (
      fn: (tx: { insert: () => { values: typeof mockDbInsert } }) => Promise<void>
    ) => {
      return fn({
        insert: () => ({ values: mockDbInsert }),
      });
    },
    query: {
      subscriptions: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sub-1',
          userId: 'user-123',
          status: 'active',
        }),
      },
      tenantSettings: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      claims: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'claim-1',
          userId: 'user-123',
          title: 'Test Claim',
          status: 'submitted',
        }),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-123',
          email: 'user@example.com',
        }),
      },
    },
  },
  subscriptions: {
    id: { name: 'id' },
    userId: { name: 'userId' },
    tenantId: { name: 'tenantId' },
    branchId: { name: 'branchId' },
    agentId: { name: 'agentId' },
  },
  claims: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
  claimDocuments: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
  user: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
  and: vi.fn(),
  eq: vi.fn(),
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: () => 'test-id',
}));

// Mock next/navigation utils
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

// Mock notifications (prevents Novu SDK initialization)
vi.mock('@/lib/notifications', () => ({
  notifyClaimSubmitted: vi.fn().mockResolvedValue({ success: true }),
  notifyStatusChanged: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('Claim Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasActiveMembership.mockResolvedValue(true);

    // Keep submitClaimCore bucket validation deterministic across environments.
    process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET = 'claim-evidence';
  });

  describe('createClaim', () => {
    it('should fail if user has no active membership', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      const subscriptionsFindFirst = db.query.subscriptions
        .findFirst as unknown as MockResolvedOnce;
      subscriptionsFindFirst.mockResolvedValueOnce(null);

      const formData = new FormData();
      const result = await createClaim({}, formData);
      expect(result).toEqual({ error: 'Membership required to create a claim.' });
    });

    it('should fail if user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const formData = new FormData();
      const result = await createClaim({}, formData);
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should fail with validation errors for empty data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      const formData = new FormData();
      const result = await createClaim({}, formData);

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
          status: 'draft',
        })
      );
    });

    it('applies tenant default branch when subscription has no branchId', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const subscriptionsFindFirst = db.query.subscriptions
        .findFirst as unknown as MockResolvedOnce;
      const tenantSettingsFindFirst = db.query.tenantSettings
        .findFirst as unknown as MockResolvedOnce;

      subscriptionsFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        userId: 'user-123',
        status: 'active',
        branchId: null,
        agentId: null,
      });

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

  describe('updateClaimStatus', () => {
    it('should deny non-admin and non-staff users', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', role: 'user', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'resolved');
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should allow staff users to update status', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'resolved');

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should allow admin users to update status', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'resolved');

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should reject invalid status values', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'super-resolved');
      expect(result).toEqual({ error: 'Invalid status' });
    });
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

      await expect(submitClaim(validPayload)).resolves.toEqual({
        success: false,
        error: 'Membership required to file a claim.',
        code: 'MEMBERSHIP_REQUIRED',
      });
    });

    it('should insert claim and documents when payload is valid', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      await submitClaim(validPayload);

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          title: 'Valid title here',
          userId: 'user-123',
          status: 'submitted',
        })
      );

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        2,
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
          status: 'submitted',
        })
      );
      // No second insert call for documents
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
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
    });

    it('should throw on database error during claim insert', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      mockDbInsert.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(submitClaim(validPayload)).rejects.toThrow(
        'Failed to create claim. Please try again.'
      );

      consoleErrorSpy.mockRestore();
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

      expect(result).toEqual({ error: 'Failed to create claim. Please try again.' });
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

  describe('updateClaimStatus - additional cases', () => {
    it('should deny unauthenticated users', async () => {
      mockGetSession.mockResolvedValue(null);
      const result = await updateClaimStatus('claim-1', 'resolved');
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should handle database errors during status update', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mockDbUpdate.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await updateClaimStatus('claim-1', 'resolved');

      consoleErrorSpy.mockRestore();

      expect(result).toEqual({ error: 'Failed to update status' });
    });

    it('should accept all valid status values', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mockDbUpdate.mockResolvedValue(undefined);

      for (const status of CLAIM_STATUSES) {
        const result = await updateClaimStatus('claim-1', status);
        expect(result).toEqual({ success: true });
      }
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
          },
        ],
      };

      await submitClaim(payload);

      expect(mockDbInsert).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([
          expect.objectContaining({
            classification: 'public',
          }),
        ])
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
