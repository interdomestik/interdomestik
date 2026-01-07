import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTransaction } = vi.hoisted(() => {
  return { mockTransaction: vi.fn() };
});

// Mock the database module before importing withTransactionRetry
vi.mock('@interdomestik/database', () => ({
  db: {
    transaction: mockTransaction,
  },
}));

// Import after mocking
import { withTransactionRetry } from '@interdomestik/shared-utils/resilience';

describe('Production Readiness Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockReset();
  });

  describe('Transaction Retry Logic', () => {
    it('should retry on deadlock errors', async () => {
      let attemptCount = 0;

      mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('deadlock detected');
        }
        // On second attempt, call the callback and return its result
        return callback({});
      });

      const result = await withTransactionRetry(async () => {
        return { success: true, data: 'test-result' };
      });

      // Assert: db.transaction was called twice (first failed with deadlock, second succeeded)
      expect(mockTransaction).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true, data: 'test-result' });
    });

    it('should not retry on non-retryable errors', async () => {
      mockTransaction.mockRejectedValue(new Error('permission denied'));

      await expect(
        withTransactionRetry(async () => {
          return { success: true };
        })
      ).rejects.toThrow('permission denied');

      // Assert: db.transaction was only called once (no retry for non-retryable error)
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
