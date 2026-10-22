import {
  assertRlsConnectionRole,
  RlsConnectionRoleAssertionError,
  RlsRolePostureTimeoutError,
  type RlsConnectionRoleAssertionOptions,
  type RlsConnectionRoleAssertionResult,
} from './rls-role-assertion';

const RETRY_COOLDOWN_MS = 5_000;

export type RlsRoleReadinessSnapshot = Readonly<{
  phase: 'idle' | 'pending' | 'ready' | 'failed';
  reason?: Exclude<RlsConnectionRoleAssertionResult, { ok: true }>['reason'];
  checkedRole?: 'connection' | 'configuredDbRole';
  timedOut?: boolean;
}>;

type ReadinessOptions = Omit<RlsConnectionRoleAssertionOptions, 'isProduction'> & {
  enabled: boolean;
  initialFailure: Error | null;
};

export class RlsRoleReadinessPendingError extends Error {
  constructor() {
    super('Database readiness has not completed; await initialization before database access.');
    this.name = 'RlsRoleReadinessPendingError';
  }
}

export function createRlsRoleReadiness(options: ReadinessOptions): {
  assertReady: () => Promise<void>;
  assertClientReady: () => void;
  snapshot: () => RlsRoleReadinessSnapshot;
} {
  let passed = !options.enabled;
  let failure: unknown = options.initialFailure;
  let phase: RlsRoleReadinessSnapshot['phase'] = passed ? 'ready' : failure ? 'failed' : 'idle';
  let started = false;
  let inFlight: Promise<void> | undefined;
  let rawQueryPending = false;
  let retryAfter = 0;

  function retryable(): boolean {
    return (
      failure instanceof RlsConnectionRoleAssertionError &&
      !failure.result.ok &&
      failure.result.reason === 'query_failed' &&
      failure.result.cause instanceof RlsRolePostureTimeoutError
    );
  }

  function assertClientReady(): void {
    if (passed) return;
    if (failure) {
      throw failure instanceof Error
        ? failure
        : new Error('DATABASE_URL_RLS role assertion failed');
    }
    throw new RlsRoleReadinessPendingError();
  }

  function start(): Promise<void> {
    started = true;
    phase = 'pending';
    inFlight = assertRlsConnectionRole({
      isProduction: true,
      configuredDbRole: options.configuredDbRole,
      timeoutMs: options.timeoutMs,
      queryRolePosture: async roleName => {
        rawQueryPending = true;
        try {
          return await options.queryRolePosture(roleName);
        } finally {
          rawQueryPending = false;
          // A timeout does not cancel SQL. Recovery waits for settlement and cooldown.
          if (failure) retryAfter = Date.now() + RETRY_COOLDOWN_MS;
        }
      },
    })
      .then(() => {
        passed = true;
        failure = undefined;
        phase = 'ready';
      })
      .catch(error => {
        failure = error;
        phase = 'failed';
        retryAfter = Date.now() + RETRY_COOLDOWN_MS;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  function snapshot(): RlsRoleReadinessSnapshot {
    const result = failure instanceof RlsConnectionRoleAssertionError ? failure.result : undefined;
    return Object.freeze({
      phase,
      ...(phase === 'failed'
        ? {
            reason: result && !result.ok ? result.reason : ('query_failed' as const),
            ...(result && !result.ok && result.checkedRole
              ? { checkedRole: result.checkedRole }
              : {}),
            timedOut: retryable(),
          }
        : {}),
    });
  }

  // Construction performs no role SQL, timer scheduling or external reporting.
  return {
    assertClientReady,
    snapshot,
    async assertReady(): Promise<void> {
      if (passed) return;
      if (inFlight) {
        await inFlight;
      } else if (
        (!started && !failure) ||
        (retryable() && !rawQueryPending && Date.now() >= retryAfter)
      ) {
        await start();
      }
      assertClientReady();
    },
  };
}
