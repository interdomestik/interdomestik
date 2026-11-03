export class RetryablePaddleWebhookError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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

/**
 * Permanent conflict: a provider subscription reference matches more than one subscription (one
 * row's id equals another row's provider reference). Processing must stop; it must never fall back
 * to customData or other evidence as if the subscription were simply absent.
 */
export class PaddleSubscriptionReferenceAmbiguousError extends Error {
  constructor(reference: string) {
    super(`Paddle subscription reference ${reference} matches more than one subscription`);
    this.name = 'PaddleSubscriptionReferenceAmbiguousError';
  }
}

export function isPaddleSubscriptionReferenceAmbiguousError(
  error: unknown
): error is PaddleSubscriptionReferenceAmbiguousError {
  return error instanceof PaddleSubscriptionReferenceAmbiguousError;
}

export function isRetryablePaddleWebhookError(
  error: unknown
): error is RetryablePaddleWebhookError {
  return error instanceof RetryablePaddleWebhookError;
}
