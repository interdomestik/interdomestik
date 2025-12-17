import type { CreateClaimValues } from '@/lib/validators/claims';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaim, submitClaim, updateClaimStatus } from './claims';

// Mocks
const mockGetSession = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mockGetSession(),
    },
  },
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    insert: () => ({ values: mockDbInsert }),
    update: () => ({ set: () => ({ where: mockDbUpdate }) }),
  },
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

describe('Claim Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createClaim', () => {
    it('should fail if user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const formData = new FormData();
      const result = await createClaim({}, formData);
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should fail with validation errors for empty data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
      const formData = new FormData();
      const result = await createClaim({}, formData);

      expect(result).toHaveProperty('error', 'Validation failed');
      expect(result).toHaveProperty('issues');
    });

    it('should create a claim successfully with valid data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
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
  });

  describe('updateClaimStatus', () => {
    it('should deny non-admin users', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', role: 'user' } });
      const result = await updateClaimStatus('claim-1', 'resolved');
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should allow admin users to update status', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      const result = await updateClaimStatus('claim-1', 'resolved');

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should reject invalid status values', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
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
          path: 'pii/claims/user-123/unassigned/file-1',
          type: 'application/pdf',
          size: 1024,
          bucket: 'claim-evidence',
          classification: 'pii',
        },
      ],
    };

    it('should throw if unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      await expect(submitClaim(validPayload)).rejects.toThrow('Unauthorized');
    });

    it('should insert claim and documents when payload is valid', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });

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
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });

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

    it('should throw on validation error', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });

      const invalidPayload = {
        title: 'AB', // Too short - needs min 5 chars
        description: 'Test',
        companyName: 'Company',
        category: 'consumer',
        claimAmount: '100.00',
        currency: 'EUR',
        files: [],
      };

      await expect(submitClaim(invalidPayload as CreateClaimValues)).rejects.toThrow(
        'Validation failed'
      );
    });

    it('should throw on database error during claim insert', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
      mockDbInsert.mockRejectedValueOnce(new Error('DB Error'));

      await expect(submitClaim(validPayload)).rejects.toThrow(
        'Failed to create claim. Please try again.'
      );
    });
  });

  describe('createClaim - error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
      mockDbInsert.mockRejectedValueOnce(new Error('DB Error'));

      const formData = new FormData();
      formData.append('title', 'Test Claim');
      formData.append('companyName', 'Bad Company');
      formData.append('category', 'retail');

      const result = await createClaim({}, formData);

      expect(result).toEqual({ error: 'Failed to create claim. Please try again.' });
    });

    it('should handle optional claimAmount as empty string', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });

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
      mockGetSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      mockDbUpdate.mockRejectedValueOnce(new Error('DB Error'));

      const result = await updateClaimStatus('claim-1', 'resolved');

      expect(result).toEqual({ error: 'Failed to update status' });
    });

    it('should accept all valid status values', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      mockDbUpdate.mockResolvedValue(undefined);

      const validStatuses = [
        'draft',
        'submitted',
        'verification',
        'evaluation',
        'negotiation',
        'court',
        'resolved',
        'rejected',
      ];

      for (const status of validStatuses) {
        const result = await updateClaimStatus('claim-1', status);
        expect(result).toEqual({ success: true });
      }
    });
  });
});
