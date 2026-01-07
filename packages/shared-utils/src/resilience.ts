import { db } from '@interdomestik/database';
import { CircuitBreaker } from './circuit-breaker';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5000,
  backoffFactor: 2,
  retryableErrors: [
    'connection timeout',
    'connection refused',
    'deadlock detected',
    'could not serialize access',
    'connection reset',
    'too many connections',
    'database is locked',
  ],
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  circuitBreaker?: CircuitBreaker
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
    try {
      const operationPromise = operation();

      if (circuitBreaker) {
        return await circuitBreaker.execute(() => operationPromise);
      }

      return await operationPromise;
    } catch (error) {
      const isLastAttempt = attempt > finalConfig.maxRetries;
      const isRetryable = isRetryableError(error, finalConfig.retryableErrors || []);

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      const delay = Math.min(
        finalConfig.baseDelay * Math.pow(finalConfig.backoffFactor, attempt - 1),
        finalConfig.maxDelay
      );

      console.warn(
        `Operation failed (attempt ${attempt}/${finalConfig.maxRetries + 1}), retrying in ${delay}ms:`,
        error
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

export async function withTransactionRetry<T>(
  operation: (tx: any) => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return withRetry(() => db.transaction(operation), {
    ...config,
    retryableErrors: [
      ...(config.retryableErrors || []),
      'deadlock detected',
      'could not serialize access',
      'tuple simultaneously updated',
    ],
  });
}

function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorName = error?.name?.toLowerCase() || '';

  return retryableErrors.some(
    pattern => errorMessage.includes(pattern) || errorName.includes(pattern)
  );
}

// Consistent lock ordering to prevent deadlocks
export const LOCK_ORDER = [
  'tenants',
  'users',
  'agent_clients',
  'subscriptions',
  'claims',
  'claim_stage_history',
  'claim_attachments',
  'messages',
  'agent_commissions',
] as const;

export function getLockOrderIndex(tableName: string): number {
  return LOCK_ORDER.indexOf(tableName as any);
}

// Helper for operations that need consistent table access order
export async function withDeadlockPrevention<T>(
  operations: Array<{ tableName: string; operation: () => Promise<any> }>
): Promise<T> {
  // Sort operations by lock order to prevent deadlocks
  const sortedOps = [...operations].sort(
    (a, b) => getLockOrderIndex(a.tableName) - getLockOrderIndex(b.tableName)
  );

  return withTransactionRetry(async tx => {
    const results: any[] = [];
    for (const op of sortedOps) {
      const result = await op.operation();
      results.push(result);
    }
    return results.at(-1); // Return last operation result
  });
}
