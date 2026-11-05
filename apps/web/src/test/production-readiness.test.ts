import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTenantTransaction } = vi.hoisted(() => {
  return { mockTenantTransaction: vi.fn() };
});

// Mock the database module before importing the retry helpers: every attempt is a tenant transaction.
vi.mock('@interdomestik/database', () => ({
  withTenantContext: mockTenantTransaction,
}));

// Import after mocking
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { transactionRetryConfig, withRetry } from '@interdomestik/shared-utils/resilience';

// The retry wraps a complete tenant transaction attempt, as registration does.
const retryTenantTransaction = <T>(operation: (tx: unknown) => Promise<T>) =>
  withRetry(() => withTenantAuthority(authority, operation), transactionRetryConfig());
const authority = mintTestTenantAuthority('tenant_mk');

describe('Production Readiness Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantTransaction.mockReset();
  });

  describe('Transaction Retry Logic', () => {
    it('should retry on deadlock errors', async () => {
      let attemptCount = 0;

      mockTenantTransaction.mockImplementation(
        async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('deadlock detected');
          }
          // On second attempt, call the callback and return its result
          return callback({});
        }
      );

      const result = await retryTenantTransaction(async () => {
        return { success: true, data: 'test-result' };
      });

      // Assert: the tenant transaction ran twice (first failed with deadlock, second succeeded)
      expect(mockTenantTransaction).toHaveBeenCalledTimes(2);
      expect(mockTenantTransaction).toHaveBeenCalledWith(authority, expect.any(Function));
      expect(result).toEqual({ success: true, data: 'test-result' });
    });

    it('should not retry on non-retryable errors', async () => {
      mockTenantTransaction.mockRejectedValue(new Error('permission denied'));

      await expect(
        retryTenantTransaction(async () => {
          return { success: true };
        })
      ).rejects.toThrow('permission denied');

      // Assert: the tenant transaction was only called once (no retry for non-retryable error)
      expect(mockTenantTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
