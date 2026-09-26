export class RetryablePaddleWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryablePaddleWebhookError';
  }
}

/**
 * Permanent (non-retryable) provider ordering failure: the signed event cannot be
 * ordered against the subscription aggregate, so it must not mutate state and
 * redelivery of the same signed payload cannot resolve it.
 */
export class PaddleEventOrderingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleEventOrderingError';
  }
}

export function isRetryablePaddleWebhookError(
  error: unknown
): error is RetryablePaddleWebhookError {
  return error instanceof RetryablePaddleWebhookError;
}
