import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaim, updateClaimStatus } from './claims';

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
});
