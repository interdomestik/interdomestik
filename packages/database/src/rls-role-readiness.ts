import {
  assertRlsConnectionRole,
  RlsConnectionRoleAssertionError,
  RlsRolePostureTimeoutError,
  type RlsConnectionRoleAssertionOptions,
  type RlsConnectionRoleAssertionResult,
} from './rls-role-assertion';

const RETRY_COOLDOWN_MS = 5_000;

type ReadinessOptions = Omit<RlsConnectionRoleAssertionOptions, 'isProduction'> & {
  enabled: boolean;
  initialFailure: Error | null;
  report: (result: RlsConnectionRoleAssertionResult, error?: unknown) => void;
};

export function createRlsRoleReadiness(options: ReadinessOptions): {
  assertReady: () => Promise<void>;
  assertClientReady: () => void;
} {
  let passed = !options.enabled;
  let failure: unknown = options.initialFailure;
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
    if (!passed && failure) {
      throw failure instanceof Error
        ? failure
        : new Error('DATABASE_URL_RLS role assertion failed');
    }
    // Preserve initial query-builder access; tenant transactions must await assertReady.
    // Recovery never clears the cached failure until the complete assertion passes.
  }

  function start(): Promise<void> {
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
          // A timeout does not cancel SQL. Keep the query slot until actual settlement,
          // then allow a later request (not a background loop) after a cooldown.
          if (failure) retryAfter = Date.now() + RETRY_COOLDOWN_MS;
        }
      },
    })
      .then(result => {
        passed = true;
        failure = undefined;
        options.report(result);
      })
      .catch(error => {
        failure = error;
        retryAfter = Date.now() + RETRY_COOLDOWN_MS;
        options.report(
          error instanceof RlsConnectionRoleAssertionError
            ? error.result
            : { ok: false, reason: 'query_failed', cause: error },
          error
        );
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  if (!passed) {
    if (failure) {
      options.report({ ok: false, reason: 'query_failed', cause: failure }, failure);
    } else {
      void start();
    }
  }

  return {
    assertClientReady,
    async assertReady(): Promise<void> {
      if (passed) return;
      if (inFlight) {
        await inFlight;
      } else if (retryable() && !rawQueryPending && Date.now() >= retryAfter) {
        await start();
      }
      assertClientReady();
    },
  };
}
