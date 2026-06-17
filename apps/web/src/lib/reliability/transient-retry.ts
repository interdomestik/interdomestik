import {
  classifyRetryError,
  type ClassifiedRetryError,
  type RetryErrorKind,
} from './error-classifier';

export type TransientRetryResult<T> =
  | { ok: true; value: T; attempts: number; elapsedMs: number }
  | {
      ok: false;
      kind: RetryErrorKind;
      attempts: number;
      elapsedMs: number;
      retryable: boolean;
      message: string;
      cause?: unknown;
    };

type RetryClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

type TransientRetryOptions = {
  classify?: (error: unknown) => ClassifiedRetryError;
  clock?: RetryClock;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxElapsedMs?: number;
  maxQuotaAttempts?: number;
  maxTransientAttempts?: number;
};

const defaultClock: RetryClock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

function maxAttemptsFor(kind: RetryErrorKind, options: RequiredRetryOptions): number {
  if (kind === 'transient') return options.maxTransientAttempts;
  if (kind === 'quota') return options.maxQuotaAttempts;
  return 1;
}

type RequiredRetryOptions = Required<
  Pick<
    TransientRetryOptions,
    'initialDelayMs' | 'maxDelayMs' | 'maxElapsedMs' | 'maxQuotaAttempts' | 'maxTransientAttempts'
  >
>;

function resolveOptions(options: TransientRetryOptions): RequiredRetryOptions {
  return {
    initialDelayMs: options.initialDelayMs ?? 200,
    maxDelayMs: options.maxDelayMs ?? 2_000,
    maxElapsedMs: options.maxElapsedMs ?? 10_000,
    maxQuotaAttempts: options.maxQuotaAttempts ?? 2,
    maxTransientAttempts: options.maxTransientAttempts ?? 3,
  };
}

function nextDelayMs(
  classified: ClassifiedRetryError,
  attempt: number,
  options: RequiredRetryOptions
) {
  if (classified.kind === 'quota' && classified.retryAfterMs !== undefined) {
    return classified.retryAfterMs;
  }

  const delay = options.initialDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, options.maxDelayMs);
}

function failed<T>(
  classified: ClassifiedRetryError,
  attempts: number,
  elapsedMs: number,
  cause: unknown,
  retryable: boolean
): TransientRetryResult<T> {
  return {
    ok: false,
    kind: classified.kind,
    attempts,
    elapsedMs,
    retryable,
    message: classified.message,
    cause,
  };
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  options: TransientRetryOptions = {}
): Promise<TransientRetryResult<T>> {
  const retryOptions = resolveOptions(options);
  const clock = options.clock ?? defaultClock;
  const classify = options.classify ?? classifyRetryError;
  const startedAt = clock.now();
  let attempts = 0;

  while (true) {
    attempts += 1;

    try {
      const value = await operation();
      return { ok: true, value, attempts, elapsedMs: clock.now() - startedAt };
    } catch (error) {
      const classified = classify(error);
      const elapsedMs = clock.now() - startedAt;
      const maxAttempts = maxAttemptsFor(classified.kind, retryOptions);
      const delayMs = nextDelayMs(classified, attempts, retryOptions);
      const canRetry =
        classified.retryable &&
        attempts < maxAttempts &&
        elapsedMs + delayMs <= retryOptions.maxElapsedMs;

      if (!canRetry) {
        return failed(classified, attempts, elapsedMs, error, false);
      }

      await clock.sleep(delayMs);
    }
  }
}

export function throwTransientRetryFailure<T>(
  result: Exclude<TransientRetryResult<T>, { ok: true }>,
  fallbackMessage: string
): never {
  if (result.cause instanceof Error) throw result.cause;
  throw new Error(result.message || fallbackMessage);
}
